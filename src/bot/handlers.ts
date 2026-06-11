import { resolvePrompt } from "../prompts/resolvePrompt";
import { buildRuntimePrompt } from "../agents/buildRuntimePrompt";
import { getTools } from "../mcp/mcpToolsAdapter";
import { createStreamingUpdater } from "../teams/streamingUpdater";
import { createStateGraph } from "../runtime/createStateGraph";
import { createBPMNStateGraph } from "../runtime/createBPMNStateGraph";
import fs from "fs";

// -----------------------------------------------------
// Main Bot Message Handler
// -----------------------------------------------------

export async function handleMessage(
  langchainreactagent: any,
  context: any,
  systemPrompt: string
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
    const runtimePrompt = buildRuntimePrompt(
      resolvedUserPrompt,
      tools,
      userText
    );

  // ---------------------------------------------------
  // BUILD FINAL SYSTEM PROMPT
  // ---------------------------------------------------

  let agentGraph: any;

  let usebpmn = true;
  if (!usebpmn) {

    agentGraph = createStateGraph(
      langchainreactagent,
      runtimePrompt,
      context.activity.conversation?.id ?? "default"
    );
  } else {

    const xml = fs.readFileSync("demo.bpmn", "utf-8");
    agentGraph = createBPMNStateGraph(xml, langchainreactagent, systemPrompt,
      context.activity.conversation?.id ?? "default"
    )
  }

  // ---------------------------------------------------
  // INVOKE LANGGRAPH AGENT
  // ---------------------------------------------------

  const streamer = await createStreamingUpdater(context);

  try {
    let result = await agentGraph.invoke({
      userQuery: runtimePrompt,
    });

    let content =
      result?.finalResponse ??
      "Sorry, I did not receive a response from the agent.";
    content = content.replace("```json\n", "");
    content = content.replace("\n```", "");

    const posted = await streamer.final(content);
    return posted ? null : content;
  } catch (err) {
    console.error("[AGENT] invoke failed", err);
    try {
      await streamer.complete();
    } catch (streamError) {
      console.warn("[STREAMER] complete failed", streamError);
    }
    return "Sorry, I encountered an internal error while generating the response. Please try again.";
  }
}
