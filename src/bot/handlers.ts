import { resolvePrompt } from "../prompts/resolvePrompt";
import { buildRuntimePrompt } from "../agents/buildRuntimePrompt";
import { getTools } from "../mcp/mcpToolsAdapter";
import { createStreamingUpdater } from "../teams/streamingUpdater";
import { createStateGraph } from "../runtime/createStateGraph";

// -----------------------------------------------------
// Main Bot Message Handler
// -----------------------------------------------------

export async function handleMessage(
  langchainreactagent: any,
  context: any,
  topLevelPrompt: string
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

  let mcpPrompt = null;

  try {
    mcpPrompt = await resolvePrompt(userText);

    if (mcpPrompt) {
      console.log("[PROMPT]", mcpPrompt.description ?? "resolved");
    }
  } catch (err) {
    console.warn("[PROMPT] resolution failed", err);
  }

  // ---------------------------------------------------
  // BUILD FINAL SYSTEM PROMPT
  // ---------------------------------------------------

  const systemPrompt = buildRuntimePrompt(
    mcpPrompt,
    tools,
    topLevelPrompt
  );

  const agentGraph = createStateGraph(
    langchainreactagent,
    systemPrompt,
    context.activity.conversation?.id ?? "default"
  );

  // ---------------------------------------------------
  // INVOKE LANGGRAPH AGENT
  // ---------------------------------------------------

  const streamer = await createStreamingUpdater(context);

  try {
    let result = await agentGraph.invoke({
      userQuery: userText,
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
