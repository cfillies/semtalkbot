# SemTalk Process Model Agent

SemTalk Process Model Agent is a Microsoft 365 Agents bot that helps users explore SemTalk process content through a LangGraph-based agent and an MCP-backed tool layer.

The bot is designed to:

- answer process-related questions in Microsoft Teams or the Microsoft 365 Agents Playground
- resolve specialized prompts based on the user message
- call SemTalk process services through tools such as process lookup, hierarchy lookup, reference-process lookup, and knowledge-graph lookup
- stream intermediate status updates while the agent is working

## How it works

At a high level, the runtime follows this flow:

1. `src/index.ts` starts the app.
2. `src/bootstrap/bootstrap.ts` connects to the MCP server and loads available tools.
3. `src/agents/createAgent.ts` builds a LangGraph ReAct agent with `gpt-4o-mini`.
4. `src/bot/bot.ts` wraps the agent in the Microsoft 365 Agents SDK message handler.
5. `src/bot/handlers.ts` composes the final system prompt, invokes the agent, and streams progress back to the conversation.

The current runtime also includes a small supervisor graph in `src/runtime/createSupervisorGraph.ts`, which is used to structure process-oriented work into a simple state flow.

## Features

- MCP tool discovery and invocation
- prompt selection based on user intent
- markdown responses and Adaptive Card passthrough
- conversation-aware LangGraph memory
- live activity updates during long-running operations
- Azure App Service deployment through the Microsoft 365 Agents Toolkit

## Repository Layout

- `src/index.ts` - application entry point
- `src/bootstrap/` - MCP bootstrap and tool loading
- `src/mcp/` - MCP client and tool adapter
- `src/agents/` - agent construction, prompts, and graph nodes
- `src/bot/` - Microsoft 365 Agents message handling
- `src/runtime/` - shared state and runtime event bus
- `infra/` - Azure deployment templates
- `appPackage/` - Teams/M365 app manifest assets
- `m365agents*.yml` - Microsoft 365 Agents Toolkit project definitions

## Configuration

The code expects a few environment variables during local development and deployment:

- `OPENAI_API_KEY` - required for the OpenAI model used by the agent
- `MCP_URL` - URL of the MCP server that provides tool definitions and prompt resources
- `MCP_URLS` - optional comma-separated list of MCP server URLs; when set, tools are loaded from all servers
- `CONNECTION_STRING` - MongoDB connection string used for process/session persistence

When using `MCP_URLS`, prompts are currently loaded from the first server in the list, while tools are merged from all configured servers.

Optional document-grounding settings:

- `MCP_DOCUMENT_INGEST_TOOLS` - comma-separated MCP tool names used to ingest uploaded files (default: `ingest_document,ingest_documents,upload_document,index_document`)
- `MCP_DOCUMENT_SEARCH_TOOLS` - comma-separated MCP tool names used to retrieve context chunks (default: `search_documents,retrieve_documents,query_documents,search_knowledge`)
- `RAG_AGENT_TAG` - optional fixed agent tag for document metadata scoping (if omitted, tag is inferred from prompt/channel/mode)

Optional local MCP RAG server settings:

- `MCP_RAG_PORT` - local MCP RAG HTTP port (default: `4041`)
- `RAG_MONGODB_URI` - MongoDB Atlas connection string (falls back to `CONNECTION_STRING`)
- `RAG_MONGODB_DB` - database name for RAG chunks (default: `semtalk`)
- `RAG_MONGODB_COLLECTION` - collection name for RAG chunks (default: `ragChunks`)
- `RAG_VECTOR_INDEX` - Atlas Vector Search index name (default: `rag_vector_index`)
- `RAG_EMBEDDING_MODEL` - OpenAI embedding model (default: `text-embedding-3-small`)
- `RAG_MAX_FILE_BYTES` - maximum document size accepted by ingest tool (default: `5242880`)
- `RAG_CHUNK_SIZE` - character chunk size (default: `900`)
- `RAG_CHUNK_OVERLAP` - character overlap between chunks (default: `120`)
- `RAG_FILE_BEARER_TOKEN` - optional bearer token used to download protected file URLs

For local runs, `OPENAI_API_KEY` should be the actual OpenAI key value the app will use at runtime.
The toolkit source files may contain `SECRET_OPENAI_API_KEY`, but that is only an input secret name.
The runtime itself reads `OPENAI_API_KEY`.

The Microsoft 365 Agents Toolkit also generates bot and tenant settings such as:

- `BOT_ID`
- `BOT_ENDPOINT`
- `BOT_AZURE_APP_SERVICE_RESOURCE_ID`
- `TEAMS_APP_ID`
- `M365_APP_ID`

### Process and LangGraph persistence

Process execution state is persisted in MongoDB so sessions can survive restarts and scale-out.

- Session metadata is stored in `processSessions` by default.
- LangGraph checkpoints use the official `@langchain/langgraph-checkpoint-mongodb` saver.
- If MongoDB settings are missing, the runtime falls back to in-memory checkpointing.

## Local Development

Prerequisites:

- Node.js 18, 20, or 22
- Microsoft 365 Agents Toolkit for VS Code or the CLI
- an OpenAI API key
- access to the MCP server and SemTalk AI service used by the tools

Typical local workflow:

1. Install dependencies.
2. Configure the local environment values generated by the toolkit.
3. Set `OPENAI_API_KEY`, `MCP_URL`.
4. Start the app in debug or dev mode.

Which file to edit:

- `npm run dev:teamsfx` uses [`.localConfigs`](./.localConfigs)
- `npm run dev:teamsfx:playground` uses [`.localConfigs.playground`](./.localConfigs.playground)
- `npm run dev` uses your shell environment, so set `OPENAI_API_KEY` before starting

Useful scripts from `package.json`:

```bash
npm run dev
npm run build
npm run start
npm run dev:mcp-rag
```

The toolkit-specific scripts are:

```bash
npm run dev:teamsfx
npm run dev:teamsfx:playground
npm run dev:teamsfx:launch-playground
```

## Runtime Behavior

The main message flow is:

- the bot receives a message
- `resolvePrompt()` checks whether a specialized MCP prompt should be loaded
- `buildRuntimePrompt()` merges the resolved prompt, fallback prompt, and current tool list
- the LangGraph agent is invoked with the composed system prompt and the user message
- `createStreamingUpdater()` updates the conversation with progress messages
- the final output is sent as either markdown text or an Adaptive Card attachment

### Uploaded document grounding

The bot now supports user file uploads in Teams and can use uploaded content as context.

Flow:

1. User uploads one or more files in chat.
2. `src/bot/handlers.ts` reads attachment metadata from the incoming activity.
3. The bot attempts to call an MCP ingestion tool (for indexing/chunking).
4. Before response generation, the bot attempts to call an MCP search tool with the user query.
5. Retrieved chunks are appended to the runtime prompt as `Document context` and the model is asked to cite chunk numbers.

Note: the MCP server must provide compatible ingestion and retrieval tools for full RAG behavior.

### MongoDB Atlas as RAG store

MongoDB Atlas is a good fit for this flow. The bot now sends agent-aware metadata in MCP calls so your ingestion/retrieval layer can isolate knowledge per agent.

Suggested document shape in Atlas:

```json
{
  "_id": "...",
  "agent": "process-agent",
  "conversationId": "...",
  "userId": "...",
  "source": "teams-attachment",
  "title": "my-spec.pdf",
  "text": "chunk text...",
  "embedding": [0.0123, -0.044, ...],
  "tags": ["teams", "upload", "agent:process-agent"],
  "createdAt": "2026-07-16T10:00:00.000Z"
}
```

Recommended Atlas indexing strategy:

1. Atlas Vector Search index on `embedding`.
2. Supporting filter fields in metadata (`agent`, `conversationId`, optionally `userId`).
3. Retrieval query should include an `agent` filter so one agent does not read another agent's context.

The bot sends these fields to MCP tools:

- Ingest: `agent`, `metadata.agent`, `metadata.tags`
- Search: `agent`, `filter.agent.$eq`

#### MCP contract used by this bot

The bot now sends a versioned payload contract (`schemaVersion: rag-v1`) while preserving backward-compatible fields.

Ingest request shape:

```json
{
  "schemaVersion": "rag-v1",
  "operation": "ingest",
  "documents": [
    {
      "documentId": "<attachment-id>",
      "title": "<filename>",
      "contentType": "application/pdf",
      "url": "<download-or-content-url>",
      "source": "teams-attachment",
      "metadata": {
        "agent": "process-agent",
        "tags": ["teams", "upload", "agent:process-agent"],
        "conversationId": "<conversation-id>",
        "userId": "<aad-or-channel-user-id>",
        "tenantId": "<tenant-id>"
      }
    }
  ],
  "context": {
    "agent": "process-agent",
    "conversationId": "<conversation-id>",
    "userId": "<user-id>",
    "tenantId": "<tenant-id>",
    "tags": ["teams", "upload", "agent:process-agent"]
  }
}
```

Search request shape:

```json
{
  "schemaVersion": "rag-v1",
  "operation": "search",
  "query": "how do we approve invoices?",
  "topK": 3,
  "context": {
    "agent": "process-agent",
    "conversationId": "<conversation-id>",
    "userId": "<user-id>",
    "tenantId": "<tenant-id>",
    "tags": ["teams", "upload", "agent:process-agent"]
  },
  "filters": {
    "agent": "process-agent",
    "conversationId": "<conversation-id>",
    "tenantId": "<tenant-id>"
  }
}
```

Expected search response shape (the bot accepts this and also looser formats):

```json
{
  "chunks": [
    {
      "title": "Invoice Policy",
      "source": "sharepoint://finance/invoice-policy.pdf",
      "text": "Approvals over $10,000 require director sign-off..."
    }
  ]
}
```

#### Atlas retrieval pipeline example

After embedding the query in your MCP service, use Atlas Vector Search with an agent filter:

```javascript
[
  {
    $vectorSearch: {
      index: "rag_vector_index",
      path: "embedding",
      queryVector: queryEmbedding,
      numCandidates: 150,
      limit: topK,
      filter: {
        agent: context.agent,
        tenantId: context.tenantId
      }
    }
  },
  {
    $project: {
      _id: 0,
      title: 1,
      source: "$metadata.source",
      text: "$text",
      score: { $meta: "vectorSearchScore" }
    }
  }
]
```

If the response parses as Adaptive Card JSON, the bot sends it as a card attachment instead of plain text.

## Prompt Routing

Prompt routing now follows a single documented MCP prompt lane:

1. `src/bootstrap/bootstrap.ts` loads the MCP prompt registry at startup.
2. `src/prompts/resolvePrompt.ts` asks the MCP prompt adapter to score the available prompts against the user message.
3. `src/mcp/mcpPromptsAdapter.ts` calls `prompts/get` for the best match and turns the returned prompt messages into runtime instructions.

If no prompt scores highly enough, the bot falls back to the default runtime prompt.

This means the bot is not using hard-coded prompt names anymore. It uses the MCP prompt registry for reusable user prompts and lets the MCP server define the prompt content.

## Local MCP RAG Server (PDF, DOCX, TXT)

The repo includes a local MCP server implementation at `src/mcpServer/ragServer.ts` with two tools:

- `ingest_documents` - validates and ingests PDF, DOCX, and TXT files into MongoDB Atlas
- `search_documents` - runs Atlas Vector Search with agent-aware filters

Run locally:

```bash
npm run dev:mcp-rag
```

Point the bot to this MCP endpoint:

```bash
MCP_URL=http://localhost:4041/mcp
```

Important: ensure your Atlas collection has a vector index matching `RAG_VECTOR_INDEX` and that your chunk documents include an `embedding` vector field.

## Azure Deployment

The repo includes Azure infrastructure templates in `infra/` and a Microsoft 365 Agents Toolkit deployment definition in `m365agents.yml`.

The Azure template provisions:

- an App Service plan
- a web app to host the bot
- a user-assigned managed identity
- bot registration wiring

The parameter file currently expects:

- a resource name suffix
- `SECRET_OPENAI_API_KEY`
- the App Service SKU
- the bot display name

## Notes

- The repository contains a few `*.ts.txt` files that look like captured source snapshots. They are not part of the main runtime path.
- `src/runtime/createStateGraph.ts` and the nodes under `src/agents/` are intentionally small and can be expanded as the process workflow grows.
- BPMN lanes and participants can define the agent layer with `<ai:Agent ... />`, while BPMN tasks carry the activity-layer prompt/tool instructions in `<ai:LLMTask ... />`.
- There are no automated tests defined yet in `package.json`.

## Related Files

- [src/index.ts](./src/index.ts)
- [src/bot/handlers.ts](./src/bot/handlers.ts)
- [src/mcp/mcpClient.ts](./src/mcp/mcpClient.ts)
- [src/mcp/mcpToolsAdapter.ts](./src/mcp/mcpToolsAdapter.ts)
- [infra/azure.bicep](./infra/azure.bicep)
- [m365agents.yml](./m365agents.yml)

<http://localhost:3978/processes-ui>
