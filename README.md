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

## Runtime Modes: Default vs JSON vs Debug

The bot supports three runtime modes, selectable via `/bot mode <mode>` command:

### Default Mode

The standard agent execution path:

1. Bot loads MCP tools and resolves the user prompt via MCP prompt registry.
2. A LangGraph ReAct agent (GPT-4o-mini) is created in `src/agents/createAgent.ts`.
3. The agent runs locally with tool-calling capabilities.
4. LangGraph checkpoints maintain conversation memory.
5. Results are sent back to Teams/Playground as markdown or Adaptive Cards.

**Best for:** Real-time conversational queries, quick tool invocation, in-process agent reasoning.

### JSON Mode

JSON mode enables external process orchestration via a separate Process Manager service:

1. User message arrives at the bot.
2. Instead of invoking the local LangGraph agent, the bot calls `/api/processes/start` on the Process Manager service (default: `http://localhost:7073`).
3. The Process Manager loads a BPMN workflow definition (e.g., from `langgraph.json`) and begins executing it.
4. The bot calls `/api/processes/{sessionId}/step` to advance the workflow one step at a time.
5. Each step may include LLM calls, tool invocations, or inter-lane message passing.
6. The workflow persists to MongoDB so sessions survive restarts and can scale across multiple processes.

**Best for:** Complex multi-step workflows, inter-lane handoff, external process orchestration, long-lived sessions.

**How to enable:**

```text
/bot mode json
```

**Environment setup:**

- `PROCESS_MANAGER_URL` - URL of the Process Manager service (default: `http://localhost:7073`)
- `PROCESS_MANAGER_API_PREFIX` - API prefix (default: `/api`)
- `CONNECTION_STRING` - MongoDB connection string for session persistence

### Debug Mode

Debug mode is identical to JSON mode except the Process Manager is configured to emit detailed step-by-step logs:

1. User message arrives at the bot.
2. Bot invokes `/api/processes/start` with `debugStepper: true`.
3. Process Manager steps through the workflow and logs each transition.
4. Useful for troubleshooting workflow logic and understanding lane routing.

**How to enable:**

```text
/bot mode debug
```

## LangGraph Graph Generation and BPMN Process Definition

### Overview

The bot can generate LangGraph state graphs from BPMN process definitions. A BPMN file (like `langgraph.json`) describes a workflow with lanes, tasks, and routing logic. When the bot runs in JSON or debug mode, the Process Manager converts this BPMN definition into a LangGraph-compatible state machine.

### BPMN Structure

The `langgraph.json` file contains:

- **Process**: Top-level workflow container.
- **Lanes**: Participant pools (e.g., "Orchestrator", "Billing", "Support"). Each lane can have a system prompt and assigned tools.
- **Elements**: Tasks, events, and gateways that make up the workflow steps.
- **Connections**: Edges between elements that define the control flow.

Example structure:

```json
{
  "ID": "process-id",
  "bpmn": {
    "processes": [
      {
        "id": "process-123",
        "name": "langgraph",
        "lanes": [
          {
            "id": "lane-1",
            "name": "Orchestrator",
            "type": "HumanResource",
            "attributes": {
              "systemPrompt": "You are the orchestrator...",
              "model": "gpt-4o-mini",
              "toolNames": "tool1,tool2"
            },
            "elements": ["task-1"]
          }
        ],
        "elements": [
          {
            "id": "task-1",
            "name": "Collect User Input",
            "type": "task",
            "tasktype": "User",
            "attributes": {
              "promptTemplate": "...",
              "systemPrompt": "..."
            },
            "inputs": ["userQuery"],
            "outputs": ["Request"]
          }
        ]
      }
    ]
  }
}
```

### Local LangGraph State Graph (Default Mode)

When running in **default mode**, `src/runtime/createStateGraph.ts` builds a simple in-memory LangGraph StateGraph:

```typescript
const graph = new StateGraph(RuntimeState)
  .addNode("processAgent", createProcessAgentNode(agent, systemPrompt, threadId))
  .addNode("aggregate", aggregateNode)
  .addEdge(START, "processAgent")
  .addEdge("processAgent", "aggregate")
  .addEdge("aggregate", END);
```

This graph:

1. Routes to the `processAgent` node, which runs the ReAct agent.
2. Routes to the `aggregate` node, which collects final output.
3. Uses an in-memory MemorySaver checkpointer for conversation memory.

### External Process Orchestration (JSON/Debug Mode)

When running in **JSON or debug mode**, the bot offloads workflow execution to the Process Manager service. The BPMN definition in `langgraph.json` is compiled into a state graph on the server side:

1. Process Manager loads the BPMN XML/JSON.
2. Each lane becomes a potential agent or execution context.
3. Each task becomes a node in the graph.
4. Connections become edges.
5. The runtime executes lane-by-lane, calling LLM endpoints and tools as defined in each task.
6. State (variables, messages, outputs) is persisted in MongoDB after each step.

**Advantages:**

- Workflows can span multiple servers and processes.
- Sessions persist across restarts.
- Lane assignments enable role-based task handling.
- Detailed audit trails and resumable checkpoints.

## StartProcess vs. StepProcess

Both functions are in `src/services/processManager.ts` and interact with the Process Manager service:

### `startProcess(request: ProcessStartRequest)`

**Purpose:** Initialize a new process session and begin execution.

**When called:**

- User sends a message and no active process session exists for the thread.
- Bot is in JSON or debug mode.

**What it does:**

1. Calls `POST /api/processes/start` on the Process Manager.
2. Passes the initial request payload, including:
   - `sessionId` - unique thread ID
   - `userQuery` - the user message
   - `debugStepper` - boolean flag for debug mode logging
   - `definitionFile` - path/name of the BPMN file to load (e.g., `langgraph.json`)
   - `connectToken` - optional authentication token for accessing external services
   - `env` - initial process variables only (NOT messages, NOT userQuery)

**Returns:** Process session details and the initial state after the first step.

**Example:**

```typescript
const result = await startProcess({
  sessionId: threadId,
  userQuery: "What is our billing process?",  // Top-level parameter
  debugStepper: false,
  definitionFile: "langgraph.json",
  connectToken: someToken,
  env: {
    // Only process variables here
    globalVars: {
      userContext: { userId, userName, ... },
      processVariables: {},
      executionMetadata: { ... },
      taskOutputs: {}
    }
  }
});
```

**Important:**

- `userQuery` is a top-level parameter, NOT in `env`
- `env` contains only process variables (globalVars)
- Messages start fresh for a new session; previous conversation history is NOT included

### `stepProcess(id: string, request: ProcessStepRequest)`

**Purpose:** Advance an existing process session by one step.

**When called:**

- User sends a follow-up message in an existing thread.
- User clicks a button that resumes the workflow with a specific value.

**What it does:**

1. Calls `POST /api/processes/{sessionId}/step` on the Process Manager.
2. Passes the step request payload, including:
   - `userQuery` - the new user input for this turn
   - `resume` - optional value to resume from a decision point or user input (null if continuing normally)
   - `env` - process variables only (NOT messages, NOT userQuery, NOT resumeValue)

**Returns:** The updated process state and any output from this step.

**Example:**

```typescript
const result = await stepProcess(threadId, {
  userQuery: "What about urgent invoices?",  // Top-level parameter
  resume: null,                               // Top-level parameter
  env: {
    // Only process variables here
    // Process Manager loads globalVars automatically
    // Messages retrieved from separate conversation storage
  }
});
```

**Important:**

- `userQuery` and `resume` are **NOT** in `env`—they are top-level parameters
- `env` contains **only** process variables (globalVars, processVariables, etc.)
- Messages are managed in a separate channel (LangGraph checkpoints)

### Typical Execution Flow

```text
Message 1: "Tell me about the billing process"
  ↓
  No active session → startProcess()
  ↓
  Process Manager loads langgraph.json, starts at first task
  ↓
  Returns: user prompt for "Generate billing instructions"
  ↓
  Bot sends live activity update to user

Message 2: "What if the amount is over $10,000?"
  ↓
  Active session exists → stepProcess()
  ↓
  Process Manager resumes from decision point
  ↓
  Routes to appropriate lane/task based on condition
  ↓
  Returns: conditional output for large amounts
  ↓
  Bot sends response
```

### Key Differences Summary

| Aspect | `startProcess()` | `stepProcess()` |
| -------- | ----------------- | ----------------- |
| **Purpose** | Initialize new session | Continue existing session |
| **API endpoint** | `POST /processes/start` | `POST /processes/{id}/step` |
| **Session exists?** | No (creates one) | Yes (must exist) |
| **Main params** | userQuery, definitionFile, debugStepper, env | resume, env |
| **Resume value** | Not applicable | Used to branch at decision points |
| **Typical count per conversation** | Once per thread | Many times (once per turn) |
| **Persistence** | Creates MongoDB session record | Updates existing session record |

### Session Lifecycle Example

**Note:** Global variables are defined in your BPMN process model, not in code. The Process Manager initializes and maintains them automatically.

```typescript
// Turn 1: User asks initial question
const session = await startProcess({
  sessionId: "thread-123",
  userQuery: "Process my invoice",
  definitionFile: "langgraph.json",
  env: {}  // Process Manager initializes globalVars from process definition
});
// → Process Manager loads langgraph.json, initializes globalVars, executes first task(s)
// → Returns initial state

// Turn 2: User provides follow-up
const update1 = await stepProcess("thread-123", {
  env: {
    userQuery: "Amount is $5,000",
    definitionFile: "langgraph.json",
    messages: previousMessages  // Conversation history
  }
});
// → Process Manager loads session + globalVars from DB, steps to next task

// Turn 3: User confirms action
const update2 = await stepProcess("thread-123", {
  resume: { approved: true },  // Resume from decision point
  env: {
    userQuery: "Approved",
    definitionFile: "langgraph.json",
    messages: currentMessages
  }
});
// → Process Manager loads session + globalVars, routes to next lane/task

// Later: Query session details
const details = await getProcessDetails("thread-123");
// → Retrieve full execution history, globalVars, outputs, and current state
```

**Key point:** `globalVars` are **automatically maintained by Process Manager** across all turns. Do not manually manage them in handlers.ts.

## State Preservation Across Turns (Multi-Turn Conversations)

Each turn in a Microsoft 365 Agents Framework (MAF) chat is a complete process run. To ensure variables persist across turns while maintaining clean architecture, follow this pattern:

### Architectural Principle: Separation of Concerns

**`env` parameter** = Process model variables only

```typescript
env: {
  globalVars: { userContext, processVariables, executionMetadata, taskOutputs }
}
```

**Conversation channel** = Message history (separate storage)

```typescript
// Managed by LangGraph checkpoints or separate MongoDB collection
// NOT mixed into env
messages: [ { role: "user", ... }, { role: "assistant", ... } ]
```

**Per-call parameters** = User input and decisions

```typescript
userQuery: "current input"
resume: userDecision
```

This ensures:

- Process Manager owns workflow state
- Conversation system owns message history
- Clean, scalable architecture

### Current Implementation (JSON/Debug Mode)

The bot currently passes both messages and process variables in `env`, but the correct architecture separates these concerns:

**Current (Mixed):**

```typescript
invocationResult = await stepProcess(threadId, {
  resume: resumeValue,
  env: {
    messages: previousMessages,      // ❌ Should NOT be here
    userQuery: groundedUserQuery,    // ❌ Should NOT be here
    definitionFile: runtimeConfig.definitionFile,  // ❌ Should NOT be here
  }
});
```

**Correct Architecture:**

- **`env`** = Process variables only (budgets, approvals, decisions, lane assignments)
- **Conversation history** = Separate channel (MongoDB checkpoints via LangGraph)
- **Per-turn context** = Separate parameters (userQuery, resumeValue passed independently or via other means)

This ensures clean separation: the Process Manager owns process state, while conversation management is separate.

### Best Practices for Variable Preservation

Rather than passing the complete state through each `stepProcess` call, maintain **global process variables** that are stored in the Process Manager session and automatically preserved across turns:

#### 1. **Global Process Variables Pattern**

Separate concerns into two distinct channels:

**`env` (Process Variables)** — Stored in session, automatically preserved:

- User context (userId, userName, sessionStartTime, preferences) *if process-scoped*
- Process variables (workflow-specific accumulations: budgets, approvals, decisions)
- Lane assignments and routing history
- Task outputs and results

**Conversation Channel (Separate)** — Managed independently:

- Messages (LangGraph checkpoints or separate MongoDB collection)
- Loaded via `getProcessDetails()` or dedicated retrieval method
- NOT mixed into `env`

**Per-Call Parameters** — Passed directly to startProcess/stepProcess:

- `userQuery` (current user input)
- `resume` (decision point responses)
- Other immediate context needed just for this step

This ensures clean separation of concerns.

#### 2. **Define Global Process Variables in BPMN Process Model**

Global variables are defined in the BPMN process definition (e.g., `langgraph.json`), not in code. The Process Manager loads and initializes these automatically when the session starts.

**Expected structure in `env.globalVars`:**

```javascript
{
  // User context (set once at session start)
  userContext: {
    userId: "...",
    userName: "...",
    sessionStartTime: "2026-08-05T...",
    tenantId: "...",
    preferredLanguage: "en"
  },
  
  // Workflow-specific accumulations (updated by BPMN tasks)
  processVariables: {
    approvalStatus: "pending",
    budgetRemaining: 5000,
    invoiceTotal: 2500,
    laneDecisions: { ... },
    // ... any workflow-specific vars
  },
  
  // Execution tracking (managed by Process Manager)
  executionMetadata: {
    laneAssignments: [ { lane: "Billing", task: "task-1", timestamp: "..." } ],
    completedTasks: [ "task-1", "task-2" ],
    currentLane: "Approval"
  },
  
  // Accumulated outputs from completed tasks
  taskOutputs: {
    taskA: { result: "..." },
    taskB: { data: "..." }
  }
}
```

**Note:** Global variables must be specified in the BPMN process definition. The Process Manager initializes them at session start and maintains them automatically across turns.

#### 3. **Initialize Global Variables from Process Model**

Global variables are defined in the BPMN process model and automatically initialized by the Process Manager at session start. The bot does not need to create them—just pass `env: {}` on the first call, and the Process Manager will initialize `globalVars` from the process definition.

**How it works:**

1. BPMN process definition includes initial `globalVars` schema
2. Bot calls `startProcess()`
3. Process Manager loads the definition and initializes `globalVars`
4. Subsequent calls to `stepProcess()` automatically preserve `globalVars`

**Example flow:**

```typescript
// Turn 1: Start new session
invocationResult = await startProcess({
  sessionId: threadId,
  userQuery: groundedUserQuery,
  definitionFile: "langgraph.json",
  env: {}  // Process Manager initializes globalVars from process model
});

// Turn 2: Step continues - globalVars already loaded
invocationResult = await stepProcess(threadId, {
  env: {
    userQuery: groundedUserQuery,
    definitionFile: definitionFile,
    messages: previousMessages,
  }
});
```

**Note:** Do not manually create or initialize globalVars in code. Define them in your BPMN process model; the Process Manager handles initialization and persistence.

#### 4. **On Subsequent Turns: Process Manager Preserves Variables Automatically**

On subsequent turns, the Process Manager automatically loads and maintains global process variables. You do not need to manually reload or pass them—just call `stepProcess()` with the current user input.

```typescript
// Turn 2+: Process Manager loads globalVars from session automatically
invocationResult = await stepProcess(threadId, {
  env: {
    userQuery: groundedUserQuery,
    definitionFile: runtimeConfig.definitionFile,
    messages: previousMessages,
  }
});
```

**Key points:**

- `globalVars` are **automatically loaded** from the session by Process Manager
- **Do NOT manually pass** globalVars in `env`—it will be overwritten
- Define globalVars once in the BPMN process model
- Focus on passing current context: `userQuery`, `messages`, `definitionFile`

#### 5. **Process Manager Loads & Updates Global Variables**

The Process Manager automatically:

1. **Loads** global variables from the session on every step
2. **Makes** them available to all lanes and tasks in the BPMN process
3. **Allows** tasks to read and update global variables
4. **Persists** global variables back to MongoDB after each step

**BPMN tasks can reference global variables** by name. Variables are available as `globalVars.processVariables.{varName}`, `globalVars.userContext.{varName}`, etc.

Example: A task in your BPMN workflow that updates a budget variable:

```json
{
  "id": "update-budget-task",
  "name": "Deduct from Budget",
  "type": "task",
  "attributes": {
    "systemPrompt": "You have access to globalVars.processVariables.budgetRemaining. Update it based on invoice approval.",
    "assignment": {
      "globalVars.processVariables.budgetRemaining": "globalVars.processVariables.budgetRemaining - invoiceAmount"
    }
  }
}
```

#### 6. **MongoDB Persistence**

Ensure the Process Manager is configured to persist to MongoDB (not in-memory):

```bash
# .env or .localConfigs
CONNECTION_STRING=mongodb+srv://user:pass@cluster.mongodb.net/semtalk?retryWrites=true
PROCESS_MANAGER_URL=http://localhost:7073
```

The Process Manager stores:

- Session metadata and global variables: `processSessions` collection
- Message history: embedded in session record or separate collection
- LangGraph checkpoints: `langgraph_checkpoint` collection (if configured)

MongoDB schema:

```javascript
db.processSessions.findOne({ threadId: "thread-123" })
// Returns:
{
  _id: ObjectId(...),
  threadId: "thread-123",
  status: "running",
  
  // Process variables (from env parameter)
  globalVars: {
    userContext: { userId: "...", ... },
    processVariables: { budgetRemaining: 5000, ... },
    executionMetadata: { laneAssignments: [...], ... },
    taskOutputs: { taskA: {...}, ... }
  },
  
  // Conversation history (separate channel - NOT in env)
  messages: [
    { role: "user", content: "...", timestamp: "..." },
    { role: "assistant", content: "...", timestamp: "..." }
  ],
  
  // Other workflow state
  currentLane: "Billing",
  
  createdAt: ISODate(...),
  updatedAt: ISODate(...)
}
```

**Key separation:**

- `globalVars` = Process variables passed in `env` parameter
- `messages` = Conversation history (separate storage, NOT mixed into env)
- Process Manager owns globalVars; conversation system owns messages

#### 7. **Handle Conversation Context in Default Mode**

Default mode uses in-memory MemorySaver. To preserve state across application restarts in default mode, you must explicitly load from MongoDB:

```typescript
// If running in default mode and need persistence:
if (mode === "default") {
  // Load previous checkpoint from MongoDB
  const mongoCheckpointer = new MongoDB.LangGraphCheckpointer(connectionString);
  
  const previousCheckpoint = await mongoCheckpointer.get(threadId);
  
  // Pass to agent
  const result = await agent.invoke(
    { messages: [...previousCheckpoint?.messages ?? [], new HumanMessage(userText)] },
    { configurable: { thread_id: threadId } }
  );
}
```

#### 8. **Query Global Variables When Needed**

To retrieve current global variables at any time:

```typescript
// After a step completes, query the session
const sessionDetails = await getProcessDetails(threadId);
const currentGlobalVars = sessionDetails?.session?.globalVars;

console.log("Current budget:", currentGlobalVars?.processVariables?.budgetRemaining);
console.log("Completed tasks:", currentGlobalVars?.executionMetadata?.completedTasks);
```

### Debugging State Preservation

#### Check what's being persisted

```bash
# Query Process Manager for session details
curl http://localhost:7073/api/processes/{threadId}

# Should return something like:
{
  "session": {
    "id": "thread-123",
    "threadId": "thread-123",
    "status": "running",
    "state": {
      "messages": [
        { "type": "human", "content": "Turn 1 query", ... },
        { "type": "ai", "content": "Turn 1 response", ... },
        { "type": "human", "content": "Turn 2 query", ... },
        ...
      ],
      "userContext": { ... },
      "processVariables": { ... }
    }
  }
}
```

#### Verify MongoDB storage

```javascript
// In MongoDB shell
db.processSessions.findOne({ threadId: "thread-123" })

// Check LangGraph checkpoints
db.langgraph_checkpoint.find({ namespace: "thread-123" })
```

#### Enable detailed logging

```typescript
// In handlers.ts
const previousProcessState = await getProcessDetails(threadId);
console.log("[STATE] Full previous state:", JSON.stringify(previousProcessState?.state, null, 2));

// Later, after stepProcess
const updatedState = await getProcessDetails(threadId);
console.log("[STATE] Updated state:", JSON.stringify(updatedState?.state, null, 2));
```

### Common Pitfalls to Avoid

1. **Losing messages on resumption**: Always load previous messages before calling `stepProcess()`.

2. **Not passing the full env**: Make sure to spread `...previousState` in the env, not just messages.

3. **Overwriting instead of appending**: Don't reassign the messages array; let the reducer handle appends.

4. **Process session not found**: If `getProcessSession()` returns null, you must call `startProcess()` first, not `stepProcess()`.

5. **MongoDB connection issues**: If state isn't persisting, verify the Process Manager is running and `CONNECTION_STRING` is configured.

6. **Resuming without resume value**: If `resumeValue` is null but you want to continue, pass it to `stepProcess()` anyway—the Process Manager will resume from the last task.

### Example: Complete Multi-Turn Flow with State

```typescript
// handlers.ts - Global process variables pattern (correct)
async function handleMessage(agent: any, context: any, systemPrompt: string) {
  const threadId = context.activity.conversation?.id ?? "default";
  let userText = context.activity.text ?? "";

  let result: any;

  if (await getProcessSession(threadId)) {
    // Session exists: process variables already initialized
    // Process Manager loads globalVars automatically from session
    result = await stepProcess(threadId, {
      userQuery: userText,      // Passed as parameter, not in env
      resume: null,             // Passed as parameter, not in env
      env: {
        // env contains ONLY process variables
        // Messages retrieved separately from conversation history
      }
    });
  } else {
    // First turn: initialize global process variables once
    const globalVars: GlobalProcessVariables = {
      userContext: {
        userId: context.activity.from?.id ?? "unknown",
        userName: context.activity.from?.name ?? "User",
        sessionStartTime: new Date().toISOString(),
        tenantId: context.activity.channelData?.tenant?.id,
        preferredLanguage: "en",
      },
      processVariables: {},
      executionMetadata: {
        laneAssignments: [],
        completedTasks: [],
      },
      taskOutputs: {},
    };

    result = await startProcess({
      sessionId: threadId,
      userQuery: userText,      // Passed as parameter, not in env
      env: {
        // env contains ONLY process variables, not messages
        globalVars,
      }
    });
  }

  return result?.result?.finalResponse ?? "No response";
}
```

**Architecture Summary:**

| Data | Channel | How Managed |
| ------ | --------- | ------------ |
| Process variables (budgets, approvals, decisions) | `env` parameter | Process Manager session |
| Conversation messages | Separate (LangGraph checkpoints) | Conversation history storage |
| Current user input | `userQuery` parameter | Per-call basis |
| User decisions/resume | `resume` parameter | Per-call basis |

This clean separation ensures:

- Process model owns only its variables
- Conversation system owns message history
- No mixing of concerns
- Easier to scale and maintain

```text

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
