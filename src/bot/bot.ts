import { MessageFactory } from "@microsoft/agents-hosting";
import { handleMessage } from "./handlers";
import { parseResponseContent } from "../runtime/responseFormat";
import { createAgent } from "../agents/createAgent";
import { DEFAULT_SYSTEM_PROMPT } from "../agents/defaultPrompt";
import { bootstrap } from "../bootstrap/bootstrap";

export async function createMAFBot(mode: string) {

  // 1. BOOTSTRAP MCP for the tools FIRST
  await bootstrap();

  // 2. CREATE AGENT one per bot instance to maintain conversation state in-memory. 
  // Note: In a real-world scenario you would have a more sophisticated bot that can use external storage
  // For production scenarios, consider using an external store for conversation state and rehydrating agent instances per turn.
  let langgraph_reactagent: any = null;
  if (mode == "default") langgraph_reactagent = createAgent();
  
  // 3. SYSTEM PROMPT
  // const systemPrompt = buildSystemPrompt(getTools());
  const systemPrompt = DEFAULT_SYSTEM_PROMPT;

  return async (context: any) => {

    let content: string | null;

    try {
      content = await handleMessage(langgraph_reactagent, context, systemPrompt, mode);
    } catch (err) {
      console.error("[BOT] handler failed", err);
      await context.sendActivity(
        "Sorry, I encountered an internal error while processing your request. Please try again later."
      );
      return;
    }

    if (!content) {
      return;
    }

    try {
      const parsed = parseResponseContent(content);

      if (parsed.kind === "adaptive_card") {
        return context.sendActivity(
          MessageFactory.attachment({
            contentType: "application/vnd.microsoft.card.adaptive",
            content: parsed.content,
          })
        );
      }
    } catch (parseError) {
      // content is not Adaptive Card JSON, fall back to markdown text
    }

    return context.sendActivity({
      type: "message",
      text: content,
      textFormat: "markdown",
    });
  };
}
