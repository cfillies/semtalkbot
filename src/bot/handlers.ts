import { resolvePrompt } from "../prompts/resolvePrompt";
import { buildRuntimePrompt } from "../agents/buildRuntimePrompt";
import { getTools } from "../mcp/mcpToolsAdapter";
import { createStreamingUpdater } from "../teams/streamingUpdater";
import { createStateGraph } from "../runtime/createStateGraph";
import { createBPMNStateGraph } from "../runtime/bpmn/createBPMNStateGraph";
import fs from "fs";
import { MessageFactory } from "@microsoft/agents-hosting";
import { Command } from "@langchain/langgraph";
import { parseResponseContent } from "../runtime/responseFormat";
import {
  getProcessDetails,
  getProcessSession,
  startProcess,
  stepProcess,
} from "../process/processManager";

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
  // INVOKE PROCESS MANAGER FOR JSON/DEBUG MODES
  // ---------------------------------------------------

  if (mode === "json" || mode === "debug") {
    let threadId = context.activity.conversation?.id ?? "default";
    const resumeValue = extractResumeValue(context.activity.value);
    const streamer = await createStreamingUpdater(context);

    try {
      let invocationResult: any;

      if (resumeValue !== null) {
        invocationResult = await stepProcess(threadId, { resume: resumeValue });

        // If this conversation has no in-memory session yet, start one and retry the step.
        if (!invocationResult) {
          await startProcess({
            sessionId: threadId,
            userQuery: userText,
            debugStepper: mode === "debug",
          });
          invocationResult = await stepProcess(threadId, { resume: resumeValue });
        }
      } else if (getProcessSession(threadId)) {
        invocationResult = await stepProcess(threadId, {
          env: { userQuery: userText },
        });
      } else {
        invocationResult = await startProcess({
          sessionId: threadId,
          userQuery: userText,
          debugStepper: mode === "debug",
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

    let threadId = context.activity.conversation?.id ?? "default";
    const resumeValue = extractResumeValue(context.activity.value);
    let agentGraph: any;
    let runtimePrompt = userText;
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

    switch (mode) {
      case "default": {
        runtimePrompt = buildRuntimePrompt(resolvedUserPrompt, tools, userText);
        agentGraph = createStateGraph(langchainreactagent, runtimePrompt, threadId);
        break;
      }
      case "bpmn": {
        const xml = fs.readFileSync("demo.bpmn", "utf-8");
        agentGraph = createBPMNStateGraph(xml, systemPrompt, threadId)
        break;
      }
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
          processVariables: {}
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
    }
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
