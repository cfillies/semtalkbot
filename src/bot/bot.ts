import { MessageFactory } from "@microsoft/agents-hosting";
import { handleMessage } from "./handlers";
import { parseResponseContent } from "../runtime/responseFormat";
import { createAgent } from "../agents/createAgent";
import { DEFAULT_SYSTEM_PROMPT } from "../agents/defaultPrompt";
import { bootstrap } from "../bootstrap/bootstrap";
import { setBotRuntimeMode } from "../config/botRuntimeConfig";

export async function createMAFBot(startupMode?: string) {

  if (startupMode) {
    try {
      setBotRuntimeMode(startupMode);
    } catch (err) {
      console.warn("[BOT] invalid startup mode, falling back to env/default", err);
    }
  }

  // 1. BOOTSTRAP MCP for the tools FIRST
  await bootstrap();

  // 2. CREATE AGENT one per bot instance to maintain conversation state in-memory. 
  // Note: In a real-world scenario you would have a more sophisticated bot that can use external storage
  // For production scenarios, consider using an external store for conversation state and rehydrating agent instances per turn.
  let langgraph_reactagent: any = null;
  langgraph_reactagent = createAgent();
  
  // 3. SYSTEM PROMPT
  // const systemPrompt = buildSystemPrompt(getTools());
  const systemPrompt = DEFAULT_SYSTEM_PROMPT;

  return async (context: any) => {

    console.log("[BOT-HANDLER] ENTRY - activity type:", context?.activity?.type);
    console.log("[BOT-HANDLER] User:", context?.activity?.from?.name, "ID:", context?.activity?.from?.id);
    console.log("[BOT-HANDLER] Text:", context?.activity?.text);
    console.log("[BOT-HANDLER] Context valid:", !!context, "sendActivity exists:", typeof context?.sendActivity === "function");
    
    let content: any = null;

    try {
      content = await handleMessage(langgraph_reactagent, context, systemPrompt);
      console.log("[BOT-HANDLER] handleMessage returned:", {
        hasContent: !!content,
        type: typeof content,
        length: typeof content === "string" ? content.length : "N/A",
        isObject: typeof content === "object"
      });
    } catch (err) {
      console.error("[BOT-HANDLER] handler EXCEPTION:", {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      try {
        const activity = {
          type: "message",
          text: "Sorry, I encountered an internal error while processing your request. Please try again later."
        };
        console.log("[BOT-HANDLER] Attempting error send with activity:", JSON.stringify(activity).substring(0, 100));
        const result = await context.sendActivity(activity);
        console.log("[BOT-HANDLER] Error send succeeded, result:", result?.id ? `✓ ${result.id}` : "no id");
      } catch (sendErr) {
        console.error("[BOT-HANDLER] error send FAILED:", {
          message: sendErr instanceof Error ? sendErr.message : String(sendErr),
          contextType: typeof context,
          hasSendActivity: typeof context?.sendActivity
        });
      }
      return;
    }

    if (!content) {
      console.log("[BOT-HANDLER] No content returned, exiting");
      return;
    }

    if (context?.activity?.type === "invoke") {
      console.log("[BOT-HANDLER] Invoke response:", typeof content);
      if (typeof content === "object" && content !== null && typeof content.status === "number") {
        return content;
      }

      return {
        status: 200,
        body: content,
      };
    }

    // Fallback send if streamer didn't send the message
    try {
      console.log("[BOT-HANDLER] Attempting fallback send, content type:", typeof content, "length:", typeof content === "string" ? content.length : "N/A");
      try {
        const parsed = parseResponseContent(content);

        if (parsed.kind === "adaptive_card") {
          console.log("[BOT-HANDLER] Sending adaptive card");
          const result = await context.sendActivity(
            MessageFactory.attachment({
              contentType: "application/vnd.microsoft.card.adaptive",
              content: parsed.content,
            })
          );
          console.log("[BOT-HANDLER] Adaptive card sent, result:", result?.id ? `✓ ${result.id}` : "no id");
          return result;
        }
      } catch (parseError) {
        // content is not Adaptive Card JSON, fall back to markdown text
        console.warn("[BOT-HANDLER] parseResponseContent failed, sending as markdown", parseError);
      }

      console.log("[BOT-HANDLER] Sending text message, length:", content?.length);
      const result = await context.sendActivity({
        type: "message",
        text: content,
        textFormat: "markdown",
      });
      console.log("[BOT-HANDLER] Text message sent, result:", result?.id ? `✓ ${result.id}` : "no id");
      return result;
    } catch (err) {
      console.error("[BOT-HANDLER] fallback send FAILED:", {
        message: err instanceof Error ? err.message : String(err),
        contextKeys: Object.keys(context || {}),
        activityType: context?.activity?.type
      });
      // If we can't send the content, log and return null
      // The streamer should have already sent a response
      return null;
    }
  };
}
