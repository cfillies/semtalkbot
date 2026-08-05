import { resolvePrompt } from "../prompts/resolvePrompt";
import { buildRuntimePrompt } from "../agents/buildRuntimePrompt";
import { getTools } from "../mcp/mcpToolsAdapter";
import { createStreamingUpdater } from "../teams/streamingUpdater";
import { createProcessStateGraph } from "../runtime/createStateGraph";
import { MessageFactory } from "@microsoft/agents-hosting";
import { Command } from "@langchain/langgraph";
import { parseResponseContent } from "../runtime/responseFormat";
import {
  appendDocumentContext,
  collectUploadedDocuments,
  ingestUploadedDocuments,
  extractDocumentsForContext,
  resolveAgentTag,
  RetrievedChunk,
  retrieveDocumentContext,
} from "./ragContext";
import {
  exchangeOboConnectToken,
  getProcessDetails,
  getProcessSession,
  startProcess,
  stepProcess,
} from "../services/processManager";
import {
  getBotRuntimeConfig,
  getSupportedBotModes,
  setBotDefinitionFile,
  setBotModelName,
  setBotRuntimeMode,
  setDocumentHandlingMode,
} from "../config/botRuntimeConfig";

// -----------------------------------------------------
// Main Bot Message Handler
// -----------------------------------------------------
let globalEnv: any = {};
let globalMsg: any = [];

export async function handleMessage(
  langchainreactagent: any,
  context: any,
  systemPrompt: string
) {
  const invokeResponse = handleComposeExtensionInvoke(context);
  if (invokeResponse) {
    return invokeResponse;
  }

  // ---------------------------------------------------
  // USER INPUT
  // ---------------------------------------------------

  let userText = context.activity.text ?? "";
  const threadId = context.activity.conversation?.id ?? "default";
  let ragModeOverride = false;

  console.log("[USER]", userText);

  // Check for /rag command to override document handling mode
  if (userText.trim().toLowerCase().startsWith("/rag")) {
    ragModeOverride = true;
    setDocumentHandlingMode("rag", threadId);
    // Strip /rag from the beginning and trim whitespace
    userText = userText.replace(/^\/rag\s*/i, "").trim();
    console.log("[COMMAND] /rag - documents will be ingested to RAG backend");
  }

  // Check for /help command
  if (userText.trim().toLowerCase() === "/help") {
    return [
      "Bot runtime commands:",
      "- /bot config",
      "- /bot mode <default|json|debug>",
      "- /bot model <definitionFile>",
      "",
      "Document handling commands:",
      "- /rag <message> - Ingest attached documents to RAG backend for this message",
      "  (Default mode: documents are added to chat context)",
    ].join("\n");
  }

  const commandResponse = handleBotRuntimeCommand(userText, threadId);
  if (commandResponse) {
    return commandResponse;
  }

  const runtimeConfig = getBotRuntimeConfig(threadId);
  const mode = runtimeConfig.mode;
  const definitionFile = runtimeConfig.definitionFile;
  const modelName = runtimeConfig.modelName
  const tools = getTools();
  const availableToolNames = new Set<string>(
    tools
      .map((tool: any) => (typeof tool?.name === "string" ? tool.name : ""))
      .filter(Boolean)
  );

  console.log(`[TOOLS] ${tools.length} loaded`);

  let resolvedUserPrompt = null;

  try {
    resolvedUserPrompt = await resolvePrompt(userText);

    if (resolvedUserPrompt) {
      console.log("[USER PROMPT]", resolvedUserPrompt.description ?? "resolved");
    }
  } catch (err) {
    console.warn("[PROMPT] resolution failed", err);
  }

  const agentTag = resolveAgentTag(context, mode, resolvedUserPrompt);

  // Debug: Log full activity structure for Copilot to understand how files are passed
  if (context.activity?.channelData?.productContext === 'COPILOT') {
    console.log("[COPILOT DEBUG] Checking for files in different locations:");
    console.log("[COPILOT DEBUG] activity.attachments:", context.activity.attachments);
    console.log("[COPILOT DEBUG] activity.entities:", JSON.stringify(context.activity.entities, null, 2));
    console.log("[COPILOT DEBUG] activity.value:", context.activity.value);
    console.log("[COPILOT DEBUG] activity.channelData.references:", context.activity.channelData?.references);
    console.log("[COPILOT DEBUG] All activity top-level keys:", Object.keys(context.activity));
    console.log("[COPILOT DEBUG] All channelData keys:", Object.keys(context.activity.channelData || {}));
  }

  const uploadedDocuments = collectUploadedDocuments(context.activity);
  const connectToken = await resolveProcessConnectToken(context);

  if (runtimeConfig.documentHandlingMode === "rag" && uploadedDocuments.length > 0) {
    console.log(`[MESSAGE] Processing ${uploadedDocuments.length} uploaded document(s) in RAG mode - sending to backend`);
    try {
      await ingestUploadedDocuments(
        uploadedDocuments,
        threadId,
        context.activity.from?.id,
        agentTag,
        context,
        availableToolNames
      );
    } catch (err) {
      console.error("[MESSAGE] Failed to ingest documents to RAG backend:", err);
      // Continue with message processing even if document ingestion fails
    }
    // return;
  } else if (context.activity.attachments?.length > 0) {
    console.log(`[MESSAGE] Activity has ${context.activity.attachments.length} attachment(s) but none were collected. Attachment structure:`, JSON.stringify(context.activity.attachments, null, 2));
  }

  // let retrievedContext: RetrievedChunk[] = [];
  let retrievedContext: RetrievedChunk[] = [];

  if (runtimeConfig.enableContextSearch) {
    try {
      retrievedContext = await retrieveDocumentContext(
        userText,
        threadId,
        context.activity.from?.id,
        agentTag,
        context,
        availableToolNames
      );
    } catch (err) {
      console.error("[MESSAGE] Failed to retrieve document context:", err);
      // Continue without context if retrieval fails
    }
  }

  let groundedUserQuery = appendDocumentContext(userText, retrievedContext);

  // If in context mode and have uploaded documents, extract and append their content
  if (runtimeConfig.documentHandlingMode === "context" && uploadedDocuments.length > 0) {
    console.log("[MESSAGE] Extracting document content for context mode");
    try {
      const documentContent = await extractDocumentsForContext(uploadedDocuments);
      if (documentContent) {
        groundedUserQuery += documentContent;
      }
    } catch (err) {
      console.error("[MESSAGE] Failed to extract document content for context:", err);
      // Continue with the message even if document extraction fails
    }
  }

  // ---------------------------------------------------
  // INVOKE PROCESS MANAGER FOR JSON/DEBUG MODES
  // ---------------------------------------------------

  if (mode === "json" || mode === "debug") {
    const resumeValue = extractResumeValue(context.activity.value);
    const streamer = await createStreamingUpdater(context);

    try {
      let invocationResult: any;
      let previousMessages: any[] = [];
      let previousEnv: any = {};

      // Try to load previous messages from process state
      try {
        // const previousProcessState = await getProcessDetails(threadId);
        previousMessages = globalMsg[threadId] ?? [];
        previousEnv = globalEnv[threadId] ?? {};
      } catch (err) {
        // First turn, no previous state yet
      }

      if (resumeValue !== null && await getProcessSession(threadId)) {
        // Check if there's actually a pending interrupt waiting for this response
        const sessionDetails = await getProcessDetails(threadId);
        // const hasInterrupt = hasPendingUserInterrupt(sessionDetails?.state);

        // if (!hasInterrupt) {
        // Only call stepProcess if there's a pending interrupt
        invocationResult = await stepProcess(threadId, {
          resume: resumeValue,
          messages: previousMessages,
          env: {}
        });

        // If stepProcess fails, retry with start
        if (!invocationResult) {
          await startProcess({
            sessionId: threadId,
            userQuery: groundedUserQuery,
            debugStepper: mode === "debug",
            definitionFile: definitionFile,
            modelName: modelName,
            connectToken,
            messages: previousMessages,
            env: previousEnv
          });
          invocationResult = await stepProcess(threadId, {
            resume: resumeValue,
            userQuery: groundedUserQuery,
            // definitionFile: definition,
            messages: previousMessages,
            env: {},
          });
        }
        // } else {
        //   // No pending interrupt - just load current session state
        //   // The interrupt was already handled internally by Process Manager
        //   invocationResult = await getProcessDetails(threadId);
        // }
      } else if (await getProcessSession(threadId)) {
        invocationResult = await stepProcess(threadId, {
          userQuery: groundedUserQuery,
          // definitionFile: definition,
          messages: previousMessages,
          env: previousEnv,
        });
      } else {
        invocationResult = await startProcess({
          sessionId: threadId,
          userQuery: groundedUserQuery,
          debugStepper: mode === "debug",
          // definitionFile: definition,
          modelName: modelName,
          connectToken,
          messages: previousMessages,
          env: previousEnv
        });
      }

      if (!invocationResult) {
        throw new Error("Process session unavailable for this conversation.");
      }

      const processDetails = await getProcessDetails(threadId);
      const graphState = processDetails?.state ?? null;

      const interruptPayload = getUserInterruptPayloadFromSummary(graphState);
      if (interruptPayload) {
        const adaptiveCard =
          interruptPayload.type === "adaptiveCard" && interruptPayload.card
            ? interruptPayload.card
            : interruptPayload;

        const posted = await streamer.final(JSON.stringify(adaptiveCard));
        if (!posted) {
          await context.sendActivity(
            MessageFactory.attachment({
              contentType: "application/vnd.microsoft.card.adaptive",
              content: adaptiveCard,
            })
          );
        }
        return;
      }

      if (mode === "debug" && hasDebugBreakpointFromSummary(graphState)) {
        const debugCard = buildDebugStepperCardFromSummary(graphState);
        const posted = await streamer.final(JSON.stringify(debugCard));
        if (!posted) {
          await context.sendActivity(
            MessageFactory.attachment({
              contentType: "application/vnd.microsoft.card.adaptive",
              content: debugCard,
            })
          );
        }
        return;
      }

      let content =
        invocationResult?.result?.finalResponse ??
        "Sorry, I did not receive a response from the agent.";
      content = normalizeFinalContent(content);

      if (invocationResult?.result?.processVariables) {
        globalEnv[threadId] = invocationResult?.result?.processVariables;
      }
      if (invocationResult?.result?.messages) {
        globalMsg[threadId] = invocationResult?.result?.messages;
      }

      const posted = await streamer.final(content);
      return posted ? null : content;
    } catch (err) {
      if (isGatewayRoutingError(err)) {
        console.warn("[AGENT] gateway routing failed", err);
        try {
          await streamer.complete();
        } catch (streamError) {
          console.warn("[STREAMER] complete failed", streamError);
        }

        return [
          "I couldn't route that request because no gateway branch matched.",
          "Please update the process so the gateway has a matching condition or a default flow.",
        ].join(" ");
      }

      console.error("[AGENT] invoke failed", err);
      try {
        await streamer.complete();
      } catch (streamError) {
        console.warn("[STREAMER] complete failed", streamError);
      }
      return "Sorry, I encountered an internal error while generating the response. Please try again.";
    }
  } else {

    // default mode

    const resumeValue = extractResumeValue(context.activity.value);
    let agentGraph: any;
    let runtimePrompt = groundedUserQuery;
    // ---------------------------------------------------
    // GET RUNTIME TOOLS
    // ---------------------------------------------------

    switch (mode) {
      case "default": {
        runtimePrompt = buildRuntimePrompt(resolvedUserPrompt, tools, groundedUserQuery);
        runtimePrompt = appendDocumentContext(runtimePrompt, retrievedContext);

        agentGraph = createProcessStateGraph(langchainreactagent, runtimePrompt, threadId);
        break;
      }
      default:
        return `Unsupported bot mode: ${mode}`;
    }
    // ---------------------------------------------------
    // INVOKE LANGGRAPH AGENT
    // ---------------------------------------------------

    const streamer = await createStreamingUpdater(context);

    try {
      const config = {
        configurable: {
          thread_id: threadId
        }
      };

      const input = resumeValue !== null
        ? new Command({ resume: resumeValue })
        : {
          userQuery: runtimePrompt,
          processVariables: {},
          messages: []
        };

      let result = await agentGraph.invoke(input, config);

      const graphState = await agentGraph.getState(config);

      if (hasPendingUserInterrupt(graphState)) {
        const interruptPayload = getUserInterruptPayload(graphState);

        const adaptiveCard =
          interruptPayload.type === "adaptiveCard" && interruptPayload.card
            ? interruptPayload.card
            : interruptPayload;

        const posted = await streamer.final(JSON.stringify(adaptiveCard));
        if (!posted) {
          await context.sendActivity(
            MessageFactory.attachment({
              contentType: "application/vnd.microsoft.card.adaptive",
              content: adaptiveCard,
            })
          );
        }
        return;
      }

      // Handle regular responses
      let content =
        result?.finalResponse ??
        "Sorry, I did not receive a response from the agent.";
      content = normalizeFinalContent(content);

      const posted = await streamer.final(content);
      return posted ? null : content;
    } catch (err) {
      if (isGatewayRoutingError(err)) {
        console.warn("[AGENT] gateway routing failed", err);
        try {
          await streamer.complete();
        } catch (streamError) {
          console.warn("[STREAMER] complete failed", streamError);
        }

        return [
          "I couldn't route that request because no gateway branch matched.",
          "Please update the process so the gateway has a matching condition or a default flow.",
        ].join(" ");
      }

      console.error("[AGENT] invoke failed", err);
      try {
        await streamer.complete();
      } catch (streamError) {
        console.warn("[STREAMER] complete failed", streamError);
      }
      return "Sorry, I encountered an internal error while generating the response. Please try again.";
    } finally {
      // Reset document mode if it was overridden by /rag command
      if (ragModeOverride) {
        setDocumentHandlingMode("context", threadId);
        console.log("[CLEANUP] Document mode reset to context");
      }
    }
  }
}

function handleComposeExtensionInvoke(context: any): any | null {
  const activity = context?.activity;
  if (!activity || activity.type !== "invoke") {
    return null;
  }

  const invokeName = String(activity.name ?? "");
  if (invokeName !== "composeExtension/query" && invokeName !== "composeExtension/submitAction") {
    return null;
  }

  const value = activity.value ?? {};
  const commandId = String(value.commandId ?? "");

  if (invokeName === "composeExtension/query" && commandId === "findProcess") {
    const query = getQueryParameterValue(value.parameters, "query") ?? "";

    const cards = buildProcessSearchCards(query);
    if (cards.length === 0) {
      return {
        composeExtension: {
          type: "message",
          text: `No quick results for \"${query}\". Try asking the bot in chat.`,
        },
      };
    }

    return {
      composeExtension: {
        type: "result",
        attachmentLayout: "list",
        attachments: cards,
      },
    };
  }

  if (invokeName === "composeExtension/submitAction" && commandId === "botConfig") {
    const mode = String(value?.data?.mode ?? "").trim();
    const definitionFile = String(value?.data?.definitionFile ?? "").trim();

    const lines = [
      "Bot runtime config commands:",
      mode ? `/bot mode ${mode}` : "Use /bot mode <default|json|debug>",
      definitionFile
        ? `/bot model ${definitionFile}`
        : "Use /bot model <definitionFile>",
      "Check current settings: /bot config",
    ];

    return {
      composeExtension: {
        type: "result",
        attachmentLayout: "list",
        attachments: [
          toThumbnailAttachment(
            "SemTalk Bot Runtime Config",
            "Insert and run these commands in chat",
            lines.join("\n")
          ),
        ],
      },
    };
  }

  return {
    composeExtension: {
      type: "message",
      text: `Unknown compose extension command: ${commandId || "(empty)"}`,
    },
  };
}

function getQueryParameterValue(parameters: any, name: string): string | null {
  const items = Array.isArray(parameters) ? parameters : [];
  const found = items.find((p: any) => String(p?.name ?? "") === name);
  const value = found?.value;

  if (value === undefined || value === null) {
    return null;
  }

  return String(value);
}

function buildProcessSearchCards(query: string) {
  const cleaned = query.trim();
  if (!cleaned) {
    return [
      toThumbnailAttachment(
        "SemTalk Process Search",
        "Start with a query",
        "Type a process name in the search box, e.g. 'invoice approval'."
      ),
    ];
  }

  const prompts = [
    `Find process: ${cleaned}`,
    `Explain process: ${cleaned}`,
    `Show BPMN summary for: ${cleaned}`,
  ];

  return prompts.map((prompt) =>
    toThumbnailAttachment(
      prompt,
      "Insert this as a chat prompt",
      "Send this message to query the SemTalk bot."
    )
  );
}

function toThumbnailAttachment(title: string, subtitle: string, text: string) {
  return {
    contentType: "application/vnd.microsoft.card.thumbnail",
    content: {
      title,
      subtitle,
      text,
    },
    preview: {
      contentType: "application/vnd.microsoft.card.thumbnail",
      content: {
        title,
        text,
      },
    },
  };
}

function handleBotRuntimeCommand(userText: string, threadId?: string): string | null {
  const text = String(userText ?? "").trim();
  if (!text.startsWith("/bot")) {
    return null;
  }

  const parts = text.split(/\s+/).filter(Boolean);
  const command = (parts[1] ?? "help").toLowerCase();

  if (command === "help") {
    return [
      "Bot runtime commands:",
      "- /bot config",
      "- /bot mode <default|json|debug>",
      "- /bot model <definitionFile>",
      "",
      "Document handling commands:",
      "- /rag <message> - Ingest attached documents to RAG backend for this message",
      "  (Default mode: documents are added to chat context)",
    ].join("\n");
  }

  if (command === "config") {
    const current = getBotRuntimeConfig(threadId);
    return [
      `mode: ${current.mode}`,
      `definitionFile: ${current.definitionFile}`,
      `supportedModes: ${getSupportedBotModes().join(", ")}`,
    ].join("\n");
  }

  if (command === "mode") {
    const nextMode = parts[2];
    if (!nextMode) {
      return `Missing mode. Use: /bot mode <${getSupportedBotModes().join("|")}>`;
    }

    try {
      const updated = setBotRuntimeMode(nextMode, threadId);
      return `Bot mode updated to: ${updated}`;
    } catch (err: any) {
      return String(err?.message ?? err);
    }
  }

  if (command === "model") {
    const value = parts.slice(2).join(" ").trim();
    if (!value) {
      return "Missing model path/name. Use: /bot model <definitionFile>";
    }

    try {
      const updated = setBotDefinitionFile(value, threadId);
      return `Bot definition file updated to: ${updated}`;
    } catch (err: any) {
      return String(err?.message ?? err);
    }
  }

  if (command === "modelName") {
    const value = parts.slice(2).join(" ").trim();
    if (!value) {
      return "Missing model name. Use: /bot model <modelName>";
    }

    try {
      const updated = setBotModelName(value, threadId);
      return `Bot modelName updated to: ${updated}`;
    } catch (err: any) {
      return String(err?.message ?? err);
    }
  }

  return `Unknown /bot command. Use: /bot help`;
}

function extractResumeValue(activityValue: any) {
  if (!activityValue || typeof activityValue !== "object") {
    return null;
  }

  if (activityValue.action?.data && typeof activityValue.action.data === "object") {
    const { action, ...rest } = activityValue;
    return {
      ...activityValue.action.data,
      ...rest,
    };
  }

  return activityValue;
}

function isGatewayRoutingError(err: any) {
  if (!err) {
    return false;
  }

  const message = typeof err.message === "string" ? err.message : String(err);
  return message.includes("No valid outgoing flow from gateway");
}

function hasPendingUserInterrupt(state: any) {
  return Boolean(state?.tasks?.some((task: any) => Array.isArray(task?.interrupts) && task.interrupts.length > 0));
}

function getUserInterruptPayload(state: any) {
  const interruptedTask = state?.tasks?.find(
    (task: any) => Array.isArray(task?.interrupts) && task.interrupts.length > 0
  );

  return interruptedTask?.interrupts?.[0]?.value ?? null;
}

function getUserInterruptPayloadFromSummary(stateSummary: any) {
  if (!stateSummary) {
    return null;
  }

  const interrupts = Array.isArray(stateSummary?.interrupts)
    ? stateSummary.interrupts
    : [];
  return interrupts[0]?.value ?? null;
}

function hasDebugBreakpointFromSummary(stateSummary: any) {
  return Array.isArray(stateSummary?.next) && stateSummary.next.length > 0;
}

function normalizeFinalContent(content: any) {
  if (typeof content !== "string") {
    return concatObjectValues(content);
  }

  const cleaned = content.replace("```json\n", "").replace("\n```", "");
  const parsed = parseResponseContent(cleaned);

  if (parsed.kind === "text") {
    return concatObjectValues(parsed.content);
  }

  return cleaned;
}

function concatObjectValues(value: any): any {
  if (value === null || value === undefined) {
    return "";
  }
  try {
    value = JSON.parse(value)
    if (Object.values(value).length == 1) {
      value = Object.values(value)[0];
    }
  } catch (_e) {

  }
  if (typeof value !== "object") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => concatObjectValues(item))
      .filter(Boolean)
      .join(" ");
  }

  const parts = Object.values(value)
    .map((item) => concatObjectValues(item))
    .filter(Boolean);

  return parts.join(" ").trim();
}

function buildDebugStepperCardFromSummary(stateSummary: any) {
  const nextNodes = Array.isArray(stateSummary?.next) ? stateSummary.next : [];
  const values = stateSummary?.env ?? {};

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: [
      {
        type: "TextBlock",
        text: "Paused by debug stepper",
        wrap: true,
        weight: "Bolder",
        color: "Attention",
      },
      {
        type: "TextBlock",
        text: "Debug pause",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "This pause is for inspection only. Click Step to continue.",
        wrap: true,
        spacing: "Small",
      },
      {
        type: "TextBlock",
        text: `Next: ${nextNodes.length ? nextNodes.join(", ") : "(none)"}`,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "State snapshot",
        wrap: true,
        spacing: "Medium",
        weight: "Bolder",
      },
      {
        type: "TextBlock",
        text: JSON.stringify(values, null, 2),
        wrap: true,
        fontType: "Monospace",
      },
    ],
    actions: [
      {
        type: "Action.Submit",
        title: "Step",
        data: {
          debugCommand: "step",
        },
      },
    ],
  };
}

async function resolveProcessConnectToken(context: any): Promise<string | undefined> {
  if (!isProcessManagerGraphCallsEnabled()) {
    return undefined;
  }

  const ssoToken = extractSsoToken(context);
  if (!ssoToken) {
    return undefined;
  }

  try {
    const connectToken = await exchangeOboConnectToken(ssoToken);
    return connectToken ?? undefined;
  } catch (err) {
    console.warn("[AUTH] unable to exchange process connect token", err);
    return undefined;
  }
}

function isProcessManagerGraphCallsEnabled(): boolean {
  return parseBooleanEnv(
    process.env.PROCESS_MANAGER_ENABLE_GRAPH_CALLS
  );
}

function parseBooleanEnv(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function extractSsoToken(context: any): string | null {
  const candidates = [
    context?.activity?.value?.authentication?.token,
    context?.activity?.value?.authentication?.ssotoken,
    context?.activity?.value?.authentication?.ssoToken,
    context?.activity?.value?.ssoToken,
    context?.activity?.value?.ssotoken,
    context?.activity?.value?.teamsToken,
    context?.activity?.value?.token,
    context?.activity?.channelData?.authentication?.token,
    context?.activity?.channelData?.authentication?.ssotoken,
    context?.turnState?.get?.("ssoToken"),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}
