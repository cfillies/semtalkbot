import { callMcpTool } from "../mcp/mcpToolsAdapter";

type UploadedDocument = {
  id?: string;
  name?: string;
  contentType?: string;
  contentUrl?: string;
  downloadUrl?: string;
};

export type RetrievedChunk = {
  title?: string;
  source?: string;
  text: string;
};

export type RagContext = {
  agent?: string;
  conversationId: string;
  userId?: string;
  tenantId?: string;
  tags: string[];
};

function parseCsvEnv(name: string, defaults: string[]) {
  const value = process.env[name];
  if (!value?.trim()) {
    return defaults;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const INGEST_TOOL_CANDIDATES = parseCsvEnv("MCP_DOCUMENT_INGEST_TOOLS", [
  "ingest_document",
  "ingest_documents",
  "upload_document",
  "index_document",
]);

const SEARCH_TOOL_CANDIDATES = parseCsvEnv("MCP_DOCUMENT_SEARCH_TOOLS", [
  "search_documents",
  "retrieve_documents",
  "query_documents",
  "search_knowledge",
]);

export function collectUploadedDocuments(activity: any): UploadedDocument[] {
  const attachments = Array.isArray(activity?.attachments) ? activity.attachments : [];

  return attachments
    .map((attachment: any) => {
      const content = attachment?.content && typeof attachment.content === "object" ? attachment.content : {};
      return {
        id: content?.id ?? attachment?.id,
        name: content?.name ?? attachment?.name,
        contentType: attachment?.contentType,
        contentUrl: attachment?.contentUrl,
        downloadUrl: content?.downloadUrl ?? content?.downloadUrl,
      };
    })
    .filter((doc: UploadedDocument) => Boolean(doc.contentUrl || doc.downloadUrl || doc.id || doc.name));
}

export async function ingestUploadedDocuments(
  documents: UploadedDocument[],
  conversationId: string,
  userId?: string,
  agentTag?: string,
  context?: any,
  availableToolNames?: Set<string>
) {
  const ragContext = buildRagContext(conversationId, userId, agentTag, context);
  const args = buildIngestArguments(documents, ragContext);
  const candidates = pickSupportedTools(INGEST_TOOL_CANDIDATES, availableToolNames);

  if (candidates.length > 0) {
    for (const toolName of candidates) {
      try {
        const result = await callMcpTool(toolName, args);

        const summary = extractTextFromToolResult(result);
        console.log(`[DOCS] ingested with ${toolName}: ${summary}`);
        return;
      } catch (err) {
        console.debug(`[DOCS] ingest tool ${toolName} unavailable or failed`, err);
      }
    }
    // console.log("[DOCS] no supported ingest tool found on current MCP server");
    // return;
  }


  console.log("[DOCS] all supported ingest tools failed");
}

export async function retrieveDocumentContext(
  query: string,
  conversationId: string,
  userId?: string,
  agentTag?: string,
  context?: any,
  availableToolNames?: Set<string>
): Promise<RetrievedChunk[]> {
  if (!query?.trim()) {
    return [];
  }

  const ragContext = buildRagContext(conversationId, userId, agentTag, context);
  const args = buildSearchArguments(query, ragContext);
  const candidates = pickSupportedTools(SEARCH_TOOL_CANDIDATES, availableToolNames);

  if (!candidates.length) {
    console.log("[DOCS] no supported search tool found on current MCP server");
    return [];
  }

  for (const toolName of candidates) {
    try {
      const result = await callMcpTool(toolName, args);

      const chunks = normalizeRetrievedChunks(result);
      if (chunks.length > 0) {
        console.log(`[DOCS] retrieved ${chunks.length} chunks via ${toolName}`);
        return chunks;
      }
    } catch (err) {
      console.debug(`[DOCS] search tool ${toolName} unavailable or failed`, err);
    }
  }

  return [];
}

export function appendDocumentContext(runtimePrompt: string, chunks: RetrievedChunk[]) {
  if (!chunks.length) {
    return runtimePrompt;
  }

  const contextBlock = chunks
    .map((chunk, index) => {
      const metaParts = [chunk.title, chunk.source].filter(Boolean);
      const meta = metaParts.length ? ` (${metaParts.join(" | ")})` : "";
      return `[${index + 1}]${meta}\n${chunk.text}`;
    })
    .join("\n\n");

  return `${runtimePrompt}\n\nDocument context (retrieved from uploaded files):\n${contextBlock}\n\nWhen answering, prioritize this document context and cite the relevant chunk number(s).`;
}

export function resolveAgentTag(context: any, mode: string, resolvedUserPrompt: any) {
  const explicit = process.env.RAG_AGENT_TAG;
  if (explicit?.trim()) {
    return sanitizeTag(explicit);
  }

  const fromPrompt =
    resolvedUserPrompt?.name ??
    resolvedUserPrompt?.id ??
    resolvedUserPrompt?.description;

  if (typeof fromPrompt === "string" && fromPrompt.trim()) {
    return sanitizeTag(fromPrompt);
  }

  const channelData = context?.activity?.channelData ?? {};
  const fromChannel =
    channelData?.agentTag ??
    channelData?.agentId ??
    channelData?.agent?.id;

  if (typeof fromChannel === "string" && fromChannel.trim()) {
    return sanitizeTag(fromChannel);
  }

  return sanitizeTag(mode || "default-agent");
}

function pickSupportedTools(candidates: string[], availableToolNames?: Set<string>) {
  if (!availableToolNames || availableToolNames.size === 0) {
    return candidates;
  }

  return candidates.filter((name) => availableToolNames.has(name));
}

function extractTextFromToolResult(result: any) {
  const content = Array.isArray(result?.content) ? result.content : [];
  const textValues = content
    .map((entry: any) => (typeof entry?.text === "string" ? entry.text : ""))
    .filter(Boolean);

  return textValues.join("\n").trim();
}

function normalizeRetrievedChunks(result: any): RetrievedChunk[] {
  const textPayload = extractTextFromToolResult(result);
  if (!textPayload) {
    return [];
  }

  try {
    const parsed = JSON.parse(textPayload);

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeRetrievedChunk(item))
        .filter((item): item is RetrievedChunk => Boolean(item));
    }
    if (parsed.content) {
      const contentArray = Array.isArray(parsed.content) ? parsed.content : [parsed.content];
      return contentArray
        .map((item: any) => normalizeRetrievedChunk(item))
        .filter((item: any): item is RetrievedChunk => Boolean(item));
    }

    if (Array.isArray(parsed?.chunks)) {
      return parsed.chunks
        .map((item: any) => normalizeRetrievedChunk(item))
        .filter((item: RetrievedChunk | null): item is RetrievedChunk => Boolean(item));
    }

    const one = normalizeRetrievedChunk(parsed);
    return one ? [one] : [];
  } catch {
    return [{ text: textPayload }];
  }
}

function normalizeRetrievedChunk(value: any): RetrievedChunk | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const text = value.trim();
    return text ? { text } : null;
  }

  if (typeof value !== "object") {
    const text = String(value).trim();
    return text ? { text } : null;
  }

  const text = String(
    value.text ?? value.content ?? value.snippet ?? value.chunk ?? ""
  ).trim();

  if (!text) {
    return null;
  }

  return {
    title: value.title ?? value.name,
    source: value.source ?? value.url ?? value.path,
    text,
  };
}

function sanitizeTag(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildTags(agentTag?: string) {
  if (!agentTag) {
    return ["teams", "upload"];
  }

  return ["teams", "upload", `agent:${agentTag}`];
}

function buildMetadataFilter(agentTag?: string) {
  if (!agentTag) {
    return undefined;
  }

  return {
    agent: { $eq: agentTag },
  };
}

function buildRagContext(
  conversationId: string,
  userId?: string,
  agentTag?: string,
  context?: any
): RagContext {
  const tenantId =
    context?.activity?.conversation?.tenantId ??
    context?.activity?.channelData?.tenant?.id ??
    context?.activity?.channelData?.tenantId;

  return {
    agent: agentTag,
    conversationId,
    userId,
    tenantId: typeof tenantId === "string" ? tenantId : undefined,
    tags: buildTags(agentTag),
  };
}

function buildIngestArguments(documents: UploadedDocument[], ragContext: RagContext) {
  const normalizedDocuments = documents.map((doc) => ({
    documentId: doc.id,
    title: doc.name,
    contentType: doc.contentType,
    url: doc.downloadUrl ?? doc.contentUrl,
    source: "teams-attachment",
    metadata: {
      agent: ragContext.agent,
      tags: ragContext.tags,
      conversationId: ragContext.conversationId,
      userId: ragContext.userId,
      tenantId: ragContext.tenantId,
    },
  }));

  return {
    schemaVersion: "rag-v1",
    operation: "ingest",
    documents: normalizedDocuments,
    context: ragContext,

    // Backward-compatible aliases for existing MCP tools.
    agent: ragContext.agent,
    metadata: {
      source: "teams-attachment",
      agent: ragContext.agent,
      tags: ragContext.tags,
    },
    conversationId: ragContext.conversationId,
    userId: ragContext.userId,
  };
}

function buildSearchArguments(query: string, ragContext: RagContext) {
  return {
    schemaVersion: "rag-v1",
    operation: "search",
    query,
    topK: 3,
    context: ragContext,
    filters: {
      agent: ragContext.agent,
      conversationId: ragContext.conversationId,
      tenantId: ragContext.tenantId,
    },

    // Backward-compatible aliases for existing MCP tools.
    agent: ragContext.agent,
    filter: buildMetadataFilter(ragContext.agent),
    conversationId: ragContext.conversationId,
    userId: ragContext.userId,
  };
}
