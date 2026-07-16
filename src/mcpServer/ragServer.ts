import { createServer } from "node:http";
import axios from "axios";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { MongoClient } from "mongodb";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

type RagContext = {
  agent?: string;
  conversationId?: string;
  userId?: string;
  tenantId?: string;
  tags?: string[];
};

type IngestDocumentInput = {
  documentId?: string;
  id?: string;
  title?: string;
  name?: string;
  contentType?: string;
  url?: string;
  contentUrl?: string;
  downloadUrl?: string;
  metadata?: Record<string, any>;
};

const MONGO_URI = process.env.RAG_MONGODB_URI || process.env.CONNECTION_STRING || "";
const MONGO_DB = process.env.RAG_MONGODB_DB || "semtalk";
const MONGO_COLLECTION = process.env.RAG_MONGODB_COLLECTION || "ragChunks";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || "text-embedding-3-small";
const VECTOR_INDEX = process.env.RAG_VECTOR_INDEX || "rag_vector_index";
const MCP_RAG_PORT = Number(process.env.MCP_RAG_PORT || 4041);
const MAX_FILE_BYTES = Number(process.env.RAG_MAX_FILE_BYTES || 5 * 1024 * 1024);
const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 900);
const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 120);
const FILE_BEARER_TOKEN = process.env.RAG_FILE_BEARER_TOKEN;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const mongoClient = new MongoClient(MONGO_URI, {
  maxPoolSize: Number(process.env.RAG_MONGO_MAX_POOL || 20),
  minPoolSize: Number(process.env.RAG_MONGO_MIN_POOL || 2),
  maxIdleTimeMS: Number(process.env.RAG_MONGO_IDLE_MS || 30000),
});
let mongoConnected = false;

const server = new McpServer({
  name: "semtalk-rag-mcp",
  version: "1.0.0",
});

const ingestSchema = z.object({
  schemaVersion: z.string().optional(),
  operation: z.string().optional(),
  documents: z.array(z.any()).default([]),
  context: z.object({
    agent: z.string().optional(),
    conversationId: z.string().optional(),
    userId: z.string().optional(),
    tenantId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  metadata: z.record(z.any()).optional(),
  agent: z.string().optional(),
  conversationId: z.string().optional(),
  userId: z.string().optional(),
}).passthrough();

const searchSchema = z.object({
  schemaVersion: z.string().optional(),
  operation: z.string().optional(),
  query: z.string(),
  topK: z.number().optional().default(3),
  context: z.object({
    agent: z.string().optional(),
    conversationId: z.string().optional(),
    userId: z.string().optional(),
    tenantId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  filters: z.object({
    agent: z.string().optional(),
    conversationId: z.string().optional(),
    tenantId: z.string().optional(),
  }).optional(),
  filter: z.any().optional(),
  agent: z.string().optional(),
  conversationId: z.string().optional(),
  userId: z.string().optional(),
}).passthrough();

server.registerTool(
  "ingest_documents",
  {
    description: "Ingest PDF, DOCX, TXT documents into MongoDB Atlas vector store.",
    inputSchema: ingestSchema,
  },
  async (args) => {
    ensureConfig();
    const collection = await getCollection();
    const context = resolveContext(args);
    const documents = normalizeIncomingDocuments(args.documents || []);

    const accepted: Array<{ title: string; chunks: number }> = [];
    const rejected: Array<{ title: string; reason: string }> = [];

    for (const doc of documents) {
      const title = doc.title || doc.documentId || "unnamed";
      const contentType = normalizeContentType(doc.contentType);

      if (!contentType || !ALLOWED_TYPES.has(contentType)) {
        rejected.push({ title, reason: `Unsupported contentType: ${doc.contentType || "unknown"}` });
        continue;
      }

      if (!doc.url) {
        rejected.push({ title, reason: "Missing file URL" });
        continue;
      }

      try {
        const bytes = await downloadFileBytes(doc.url);
        if (bytes.length > MAX_FILE_BYTES) {
          rejected.push({ title, reason: `File too large (${bytes.length} bytes)` });
          continue;
        }

        const extracted = await extractText(bytes, contentType);
        if (!extracted.trim()) {
          rejected.push({ title, reason: "No extractable text found" });
          continue;
        }

        const chunks = splitIntoChunks(extracted, CHUNK_SIZE, CHUNK_OVERLAP);
        const rows = [];

        for (let i = 0; i < chunks.length; i += 1) {
          const chunk = chunks[i];
          const embedding = await embedText(chunk);

          rows.push({
            agent: context.agent,
            conversationId: context.conversationId,
            userId: context.userId,
            tenantId: context.tenantId,
            source: "teams-attachment",
            title,
            text: chunk,
            embedding,
            metadata: {
              documentId: doc.documentId,
              sourceUrl: doc.url,
              tags: context.tags,
              chunkIndex: i,
              totalChunks: chunks.length,
            },
            createdAt: new Date(),
          });
        }

        if (rows.length) {
          await collection.insertMany(rows);
        }

        accepted.push({ title, chunks: rows.length });
      } catch (err: any) {
        rejected.push({ title, reason: err?.message || "Ingestion failed" });
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            accepted,
            rejected,
            insertedChunks: accepted.reduce((sum, item) => sum + item.chunks, 0),
          }),
        },
      ],
    };
  }
);

server.registerTool(
  "search_documents",
  {
    description: "Semantic search over ingested RAG chunks from MongoDB Atlas.",
    inputSchema: searchSchema,
  },
  async (args) => {
    ensureConfig();
    const collection = await getCollection();
    const context = resolveContext(args);
    const topK = Math.max(1, Math.min(10, Number(args.topK || 3)));

    const queryVector = await embedText(args.query);

    const atlasFilter: Record<string, any> = {};
    if (context.agent) atlasFilter.agent = context.agent;
    if (context.tenantId) atlasFilter.tenantId = context.tenantId;

    const pipeline: any[] = [
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: "embedding",
          queryVector,
          numCandidates: Math.max(50, topK * 50),
          limit: topK,
          ...(Object.keys(atlasFilter).length ? { filter: atlasFilter } : {}),
        },
      },
      {
        $project: {
          _id: 0,
          title: 1,
          source: "$metadata.sourceUrl",
          text: "$text",
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ chunks: results }),
        },
      ],
    };
  }
);

async function getCollection() {
  if (!mongoConnected) {
    await mongoClient.connect();
    mongoConnected = true;
  }

  return mongoClient.db(MONGO_DB).collection(MONGO_COLLECTION);
}

function ensureConfig() {
  if (!MONGO_URI) {
    throw new Error("RAG_MONGODB_URI (or CONNECTION_STRING) is required.");
  }

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for embeddings.");
  }
}

function normalizeIncomingDocuments(docs: IngestDocumentInput[]) {
  return docs.map((doc) => ({
    documentId: doc.documentId || doc.id,
    title: doc.title || doc.name,
    contentType: doc.contentType,
    url: doc.url || doc.downloadUrl || doc.contentUrl,
    metadata: doc.metadata || {},
  }));
}

function normalizeContentType(contentType?: string) {
  if (!contentType) {
    return undefined;
  }

  return contentType.split(";")[0].trim().toLowerCase();
}

function resolveContext(args: any): RagContext {
  return {
    agent: args?.context?.agent || args?.filters?.agent || args?.agent,
    conversationId: args?.context?.conversationId || args?.conversationId,
    userId: args?.context?.userId || args?.userId,
    tenantId: args?.context?.tenantId || args?.filters?.tenantId,
    tags: args?.context?.tags || args?.metadata?.tags || [],
  };
}

async function downloadFileBytes(url: string) {
  const headers: Record<string, string> = {};
  if (FILE_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${FILE_BEARER_TOKEN}`;
  }

  const res = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    headers,
    timeout: Number(process.env.RAG_FILE_DOWNLOAD_TIMEOUT_MS || 15000),
    maxRedirects: 5,
  });

  return Buffer.from(res.data);
}

async function extractText(buffer: Buffer, contentType: string) {
  if (contentType === "text/plain") {
    return buffer.toString("utf8");
  }

  if (contentType === "application/pdf") {
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }

  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const parsed = await mammoth.extractRawText({ buffer });
    return parsed.value || "";
  }

  return "";
}

function splitIntoChunks(text: string, chunkSize: number, overlap: number) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const out: string[] = [];
  let start = 0;
  const safeOverlap = Math.max(0, Math.min(overlap, chunkSize - 1));

  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + chunkSize);
    out.push(normalized.slice(start, end));
    if (end === normalized.length) {
      break;
    }
    start = end - safeOverlap;
  }

  return out;
}

async function embedText(text: string) {
  const payload = {
    model: EMBEDDING_MODEL,
    input: text,
  };

  const res = await axios.post(
    "https://api.openai.com/v1/embeddings",
    payload,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: Number(process.env.RAG_EMBED_TIMEOUT_MS || 20000),
    }
  );

  const embedding = res.data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Embedding response missing vector data.");
  }

  return embedding;
}

async function main() {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith("/mcp")) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    await transport.handleRequest(req, res);
  });

  httpServer.listen(MCP_RAG_PORT, () => {
    console.log(`[MCP-RAG] listening on http://localhost:${MCP_RAG_PORT}/mcp`);
  });
}

main().catch((err) => {
  console.error("[MCP-RAG] fatal error", err);
  process.exit(1);
});
