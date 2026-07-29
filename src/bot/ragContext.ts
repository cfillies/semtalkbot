import { callMcpTool } from "../mcp/mcpToolsAdapter";
import { ingestDocumentsToBackend, searchDocumentsInBackend, type UploadedDocument as DocumentServiceUploadedDocument, type SearchedChunk } from "../services/documentService";
import { parseDocumentContent, formatDocumentsForContext, type ParsedDocument } from "../services/documentParser";
import { getBotRuntimeConfig } from "../config/botRuntimeConfig";

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
  const isCopilot = activity?.channelData?.productContext === 'COPILOT';
  const attachments = Array.isArray(activity?.attachments) ? activity.attachments : [];

  if (isCopilot) {
    console.log(`[DOCS] Copilot chat detected. Attachments found: ${attachments.length}`);
    if (attachments.length === 0) {
      console.log(`[DOCS] Note: Copilot chats may pass attachments differently. Activity structure:`, {
        hasAttachments: !!activity?.attachments,
        hasEntities: !!activity?.entities,
        channelDataKeys: Object.keys(activity?.channelData || {})
      });
    }
  }

  const documents = attachments
    .map((attachment: any, index: number) => {
      const content = attachment?.content && typeof attachment.content === "object" ? attachment.content : {};
      
      // Debug logging for first few attachments to help diagnose desktop client issues
      if (index === 0) {
        console.log(`[DOCS] First attachment structure:`, JSON.stringify(attachment, null, 2));
      }

      const doc = {
        id: content?.id ?? attachment?.id,
        name: content?.name ?? attachment?.name,
        contentType: attachment?.contentType ?? content?.contentType,
        // Try multiple fallback chains for URLs (web and desktop clients may differ)
        contentUrl: attachment?.contentUrl ?? content?.contentUrl ?? attachment?.content?.contentUrl,
        downloadUrl: content?.downloadUrl ?? attachment?.downloadUrl ?? attachment?.content?.downloadUrl,
      };

      // Debug any attachment that doesn't have a URL
      if (!doc.downloadUrl && !doc.contentUrl) {
        console.warn(`[DOCS] Attachment ${index} (${doc.name || 'unnamed'}) has no download/content URL:`, JSON.stringify(attachment, null, 2));
      }

      return doc;
    })
    .filter((doc: UploadedDocument) => Boolean(doc.contentUrl || doc.downloadUrl || doc.id || doc.name));

  if (documents.length > 0) {
    console.log(`[DOCS] collected ${documents.length} attachment(s):`, documents.map((d: any) => ({ name: d.name, contentType: d.contentType, id: d.id, hasUrl: Boolean(d.downloadUrl || d.contentUrl) })));
  } else if (attachments.length > 0) {
    console.warn(`[DOCS] ${attachments.length} attachment(s) present but none were collected (no valid URLs found)`);
  }

  return documents;
}

export async function ingestUploadedDocuments(
  documents: UploadedDocument[],
  conversationId: string,
  userId?: string,
  agentTag?: string,
  context?: any,
  availableToolNames?: Set<string>
) {
  if (!documents.length) {
    console.log("[DOCS] no documents to ingest");
    return;
  }

  const runtimeConfig = getBotRuntimeConfig(conversationId);
  const documentMode = runtimeConfig.documentHandlingMode;

  console.log(`[DOCS] processing ${documents.length} document(s) in "${documentMode}" mode`);

  // Extract tenant ID from context
  const tenantId =
    context?.activity?.conversation?.tenantId ??
    context?.activity?.channelData?.tenant?.id ??
    context?.activity?.channelData?.tenantId;

  if (documentMode === "rag") {
    // RAG Mode: Send to backend for MongoDB ingestion
    console.log("[DOCS] RAG mode: Sending documents to backend service");

    const result = await ingestDocumentsToBackend(documents, {
      conversationId,
      userId,
      tenantId: typeof tenantId === "string" ? tenantId : undefined,
      agentTag,
      tags: buildTags(agentTag),
    });

    if (result.success) {
      console.log(`[DOCS] Backend ingestion successful: ${result.message}`);
    } else {
      console.warn(`[DOCS] Backend ingestion failed: ${result.message}`);
    }
    return;
  }

  // Context mode: documents are handled locally via parsing
  // They will be added to agent context via appendDocumentContext()
  console.log("[DOCS] Context mode: Documents will be parsed and added to agent context (handled elsewhere)");
}

/**
 * Extract and format document content for inclusion in agent context
 * Only called in "context" mode - parses documents locally and returns formatted content
 */
export async function extractDocumentsForContext(
  documents: UploadedDocument[]
): Promise<string> {
  if (!documents.length) {
    return "";
  }

  console.log(`[DOCS] Extracting content from ${documents.length} document(s) for context`);

  const parsedDocs: ParsedDocument[] = [];

  for (const doc of documents) {
    if (!doc.downloadUrl && !doc.contentUrl) {
      console.warn(`[DOCS] Skipping document ${doc.name}: no download URL available`);
      continue;
    }

    const url = doc.downloadUrl || doc.contentUrl;
    if (!url) continue;

    try {
      const parsed = await parseDocumentContent(url, doc.name || "unknown", doc.contentType);
      if (parsed) {
        parsedDocs.push(parsed);
      }
    } catch (error) {
      console.error(`[DOCS] Failed to extract content from ${doc.name}:`, error);
    }
  }

  if (!parsedDocs.length) {
    console.log("[DOCS] No documents were successfully parsed");
    return "";
  }

  const formatted = formatDocumentsForContext(parsedDocs);
  console.log(`[DOCS] Formatted ${parsedDocs.length} document(s) for context: ${Math.round(formatted.length / 1024)}KB`);

  return formatted;
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

  // Extract tenant ID from context
  const tenantId =
    context?.activity?.conversation?.tenantId ??
    context?.activity?.channelData?.tenant?.id ??
    context?.activity?.channelData?.tenantId;

  // Try backend REST API first
  console.log("[DOCS] Searching backend via REST API for: " + query);
  const backendChunks = await searchDocumentsInBackend(
    query,
    conversationId,
    userId,
    agentTag,
    typeof tenantId === "string" ? tenantId : undefined,
    3 // topK
  );

  if (backendChunks.length > 0) {
    console.log(`[DOCS] Retrieved ${backendChunks.length} chunks from backend REST API`);
    return backendChunks.map((chunk: SearchedChunk) => ({
      title: chunk.title,
      source: chunk.source,
      text: chunk.text,
    }));
  }

  if (false) {

    // Fallback to MCP tools if backend search returned no results
    console.log("[DOCS] No results from backend API, falling back to MCP search tools");
    const ragContext = buildRagContext(conversationId, userId, agentTag, context);
    const args = buildSearchArguments(query, ragContext);
    const candidates = pickSupportedTools(SEARCH_TOOL_CANDIDATES, availableToolNames);

    if (!candidates.length) {
      console.log("[DOCS] No supported MCP search tool found");
      return [];
    }

    for (const toolName of candidates) {
      try {
        const result = await callMcpTool(toolName, args);

        const chunks = normalizeRetrievedChunks(result);
        if (chunks.length > 0) {
          console.log(`[DOCS] Retrieved ${chunks.length} chunks via MCP tool ${toolName}`);
          return chunks;
        }
      } catch (err) {
        console.debug(`[DOCS] MCP search tool ${toolName} unavailable or failed`, err);
      }
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
