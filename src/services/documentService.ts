import axios, { AxiosInstance } from "axios";

export type UploadedDocument = {
  id?: string;
  name?: string;
  contentType?: string;
  contentUrl?: string;
  downloadUrl?: string;
};

export type DocumentMetadata = {
  conversationId: string;
  userId?: string;
  tenantId?: string;
  agentTag?: string;
  tags?: string[];
};

/**
 * Format expected by backend for document ingestion via REST
 * Matches the MCP ingest_documents tool schema for compatibility
 */
interface DocumentIngestRequest {
  schemaVersion: "rag-v1";
  operation: "ingest";
  documents: Array<{
    documentId?: string;
    title?: string;
    contentType?: string;
    url: string;
    source: "teams-attachment";
    metadata: {
      agent?: string;
      tags: string[];
      conversationId: string;
      userId?: string;
      tenantId?: string;
    };
  }>;
  context: {
    agent?: string;
    conversationId: string;
    userId?: string;
    tenantId?: string;
    tags: string[];
  };
  // Backward-compatible aliases
  agent?: string;
  metadata: {
    source: "teams-attachment";
    agent?: string;
    tags: string[];
  };
  conversationId: string;
  userId?: string;
}

// Create axios instance with proper configuration
let client: AxiosInstance;

function getDocumentServiceClient(): AxiosInstance {
  if (!client) {
    const DEFAULT_PROCESS_MANAGER_URL = "https://semaiservice26.azurewebsites.net";
    // const DEFAULT_PROCESS_MANAGER_API_PREFIX = "/api";
    const baseUrl = process.env.BACKEND_DOCUMENT_SERVICE_URL || DEFAULT_PROCESS_MANAGER_URL;
    // const baseUrl = process.env.BACKEND_DOCUMENT_SERVICE_URL || "http://localhost:7073";
    client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
  return client;
}

/**
 * Send documents to backend for RAG ingestion via REST
 * Uses the same schema as the MCP ingest_documents tool for consistency
 */
export async function ingestDocumentsToBackend(
  documents: UploadedDocument[],
  metadata: DocumentMetadata
): Promise<{ success: boolean; message: string; documentCount: number }> {
  if (!documents.length) {
    return { success: true, message: "No documents to ingest", documentCount: 0 };
  }

  try {
    const client = getDocumentServiceClient();

    // Build tags from agent tag
    const tags = metadata.agentTag
      ? ["teams", "upload", `agent:${metadata.agentTag}`]
      : ["teams", "upload"];

    // Map Teams documents to backend format (same as MCP schema)
    const normalizedDocuments = documents.map((doc) => ({
      documentId: doc.id,
      title: doc.name,
      contentType: doc.contentType,
      url: doc.downloadUrl || doc.contentUrl || "",
      source: "teams-attachment" as const,
      metadata: {
        agent: metadata.agentTag,
        tags,
        conversationId: metadata.conversationId,
        userId: metadata.userId,
        tenantId: metadata.tenantId,
      },
    }));

    // Build request in same format as MCP tool arguments
    const ragContext = {
      agent: metadata.agentTag,
      conversationId: metadata.conversationId,
      userId: metadata.userId,
      tenantId: metadata.tenantId,
      tags,
    };

    const ingestRequest: DocumentIngestRequest = {
      schemaVersion: "rag-v1",
      operation: "ingest",
      documents: normalizedDocuments,
      context: ragContext,
      // Backward-compatible aliases
      agent: metadata.agentTag,
      metadata: {
        source: "teams-attachment",
        agent: metadata.agentTag,
        tags,
      },
      conversationId: metadata.conversationId,
      userId: metadata.userId,
    };

    console.log(
      `[DOCUMENT-SERVICE] Sending ${documents.length} document(s) to backend for ingestion`
    );
    console.log(`[DOCUMENT-SERVICE] Request:`, JSON.stringify(ingestRequest, null, 2));

    const response = await client.post("/api/documents/ingest", ingestRequest);

    console.log(
      `[DOCUMENT-SERVICE] Backend response:`,
      response.status,
      JSON.stringify(response.data)
    );

    return {
      success: true,
      message: response.data?.message || "Documents ingested successfully",
      documentCount: documents.length,
    };
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || "Unknown error";
    const statusCode = error.response?.status || "unknown";

    console.error(
      `[DOCUMENT-SERVICE] Failed to ingest documents to backend (${statusCode}):`,
      errorMessage
    );

    // Don't throw - let the calling function decide how to handle this
    return {
      success: false,
      message: `Backend ingestion failed: ${errorMessage}`,
      documentCount: documents.length,
    };
  }
}

/**
 * Check if backend document service is available
 */
export async function isDocumentServiceAvailable(): Promise<boolean> {
  try {
    const client = getDocumentServiceClient();
    const response = await client.get("/health", { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.warn("[DOCUMENT-SERVICE] Backend service not available");
    return false;
  }
}

export type SearchedChunk = {
  title?: string;
  source?: string;
  text: string;
};

/**
 * Search documents in backend via REST API
 * Matches the MCP search_documents tool schema for consistency
 */
export async function searchDocumentsInBackend(
  query: string,
  conversationId: string,
  userId?: string,
  agentTag?: string,
  tenantId?: string,
  topK: number = 3
): Promise<SearchedChunk[]> {
  if (!query?.trim()) {
    console.log("[DOCUMENT-SERVICE] Empty search query, returning no results");
    return [];
  }

  try {
    const client = getDocumentServiceClient();

    // Build tags from agent tag
    const tags = agentTag ? ["teams", "upload", `agent:${agentTag}`] : ["teams", "upload"];

    // Build search request in same format as MCP tool arguments
    const ragContext = {
      agent: agentTag,
      conversationId,
      userId,
      tenantId,
      tags,
    };

    const searchRequest = {
      schemaVersion: "rag-v1",
      operation: "search",
      query,
      topK,
      context: ragContext,
      // Backward-compatible aliases for existing MCP tools
      agent: agentTag,
      filter: agentTag ? { agent: { $eq: agentTag } } : undefined,
      conversationId,
      userId,
      tenantId,
    };

    console.log(`[DOCUMENT-SERVICE] Searching backend for: "${query}"`);

    const response = await client.post("/api/documents/search", searchRequest);

    console.log(
      `[DOCUMENT-SERVICE] Search response:`,
      response.status,
      `(${response.data?.chunks?.length ?? 0} chunks found)`
    );

    // Normalize chunks from backend response
    const chunks = response.data?.chunks ?? response.data?.content ?? [];
    if (!Array.isArray(chunks)) {
      console.warn("[DOCUMENT-SERVICE] Unexpected search response format:", response.data);
      return [];
    }

    // Map backend chunks to our SearchedChunk type
    return chunks
      .map((chunk: any) => ({
        title: chunk.title || chunk.name,
        source: chunk.source || chunk.url || chunk.path,
        text: chunk.text || chunk.content || chunk.snippet || "",
      }))
      .filter((chunk: SearchedChunk) => chunk.text?.trim());
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || "Unknown error";
    const statusCode = error.response?.status || "unknown";

    console.error(
      `[DOCUMENT-SERVICE] Search failed (${statusCode}):`,
      errorMessage
    );

    // Return empty array instead of throwing - let the calling function handle it
    return [];
  }
}


