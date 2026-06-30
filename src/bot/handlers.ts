import { resolvePrompt } from "../prompts/resolvePrompt";
import { buildRuntimePrompt } from "../agents/buildRuntimePrompt";
import { getTools } from "../mcp/mcpToolsAdapter";
import { createStreamingUpdater } from "../teams/streamingUpdater";
import { createStateGraph } from "../runtime/createStateGraph";
import { createBPMNStateGraph } from "../runtime/createBPMNStateGraph";
import fs from "fs";
import { createJSONStateGraph } from "../runtime/createJSONStateGraph";
import { MessageFactory } from "@microsoft/agents-hosting";
import { Command } from "@langchain/langgraph";
import { parseResponseContent } from "../runtime/responseFormat";

// -----------------------------------------------------
// Main Bot Message Handler
// -----------------------------------------------------

export async function handleMessage(
  langchainreactagent: any,
  context: any,
  systemPrompt: string,
  mode: string
) {
  // ---------------------------------------------------
  // USER INPUT
  // ---------------------------------------------------

  const userText = context.activity.text ?? "";

  console.log("[USER]", userText);

  // ---------------------------------------------------
  // GET RUNTIME TOOLS
  // ---------------------------------------------------

  const tools = getTools();

  console.log(`[TOOLS] ${tools.length} loaded`);


  // ---------------------------------------------------
  // RESOLVE MCP PROMPT
  // ---------------------------------------------------

  let resolvedUserPrompt = null;

  try {
    resolvedUserPrompt = await resolvePrompt(userText);

    if (resolvedUserPrompt) {
      console.log("[USER PROMPT]", resolvedUserPrompt.description ?? "resolved");
    }
  } catch (err) {
    console.warn("[PROMPT] resolution failed", err);
  }


  // ---------------------------------------------------
  // BUILD FINAL SYSTEM PROMPT
  // ---------------------------------------------------

  let agentGraph: any;

  let runtimePrompt = userText;

  switch (mode) {
    case "default": {
      runtimePrompt = buildRuntimePrompt(
        resolvedUserPrompt,
        tools,
        userText
      );
      agentGraph = createStateGraph(
        langchainreactagent,
        runtimePrompt,
        context.activity.conversation?.id ?? "default"
      );
      break;
    }
    case "bpmn": {
      const xml = fs.readFileSync("demo.bpmn", "utf-8");
      agentGraph = createBPMNStateGraph(xml, langchainreactagent, systemPrompt,
        context.activity.conversation?.id ?? "default"
      )
      break;
    }
    case "json": {
      let prompt = systemPrompt;
      prompt = "";
      const json = fs.readFileSync("langgraph.json", "utf-8");
      agentGraph = createJSONStateGraph(json, langchainreactagent, prompt,
        context.activity.conversation?.id ?? "default"
      )
      break;
    }
    case "debug": {
      let prompt = systemPrompt;
      prompt = "";
      const json = fs.readFileSync("langgraph.json", "utf-8");
      agentGraph = createJSONStateGraph(
        json,
        langchainreactagent,
        prompt,
        context.activity.conversation?.id ?? "default",
        { debugStepper: true }
      );
      break;
    }
  }

  // ---------------------------------------------------
  // INVOKE LANGGRAPH AGENT
  // ---------------------------------------------------

  const streamer = await createStreamingUpdater(context);
  const threadId = context.activity.conversation?.id ?? "default"; // Get thread ID
  const resumeValue = extractResumeValue(context.activity.value);

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
          processVariables: {}
        };

    let result = await agentGraph.invoke(input, config);

    const graphState = await agentGraph.getState(config);

    if (hasPendingUserInterrupt(graphState)) {
      const interruptPayload = getUserInterruptPayload(graphState);

      try {
        await streamer.complete();
      } catch (streamError) {
        console.warn("[STREAMER] complete failed", streamError);
      }

      const adaptiveCard =
        interruptPayload.type === "adaptiveCard" && interruptPayload.card
          ? interruptPayload.card
          : interruptPayload;

      await context.sendActivity(
        MessageFactory.attachment({
          contentType: "application/vnd.microsoft.card.adaptive",
          content: adaptiveCard,
        })
      );
      return;
    }

    if (mode === "debug" && hasDebugBreakpoint(graphState)) {
      try {
        await streamer.complete();
      } catch (streamError) {
        console.warn("[STREAMER] complete failed", streamError);
      }

      await context.sendActivity(
        MessageFactory.attachment({
          contentType: "application/vnd.microsoft.card.adaptive",
          content: buildDebugStepperCard(graphState),
        })
      );
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
  }
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

function hasDebugBreakpoint(state: any) {
  return Array.isArray(state?.next) && state.next.length > 0;
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

function concatObjectValues(value: any) {
  if (value === null || value === undefined) {
    return "";
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

function buildDebugStepperCard(state: any) {
  const nextNodes = Array.isArray(state?.next) ? state.next : [];
  const values = state?.values ?? {};
  const step = state?.metadata?.step ?? 0;

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
        text: `Step ${step}`,
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
