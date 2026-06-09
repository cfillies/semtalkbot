import { MessageFactory } from "@microsoft/agents-hosting";
import { handleMessage } from "./handlers";
import { parseResponseContent } from "../runtime/responseFormat";

export function createMAFBot(langchainagent: any, systemPrompt: string) {

  return async (context: any) => {

    let content: string | null;

    try {
      content = await handleMessage(langchainagent, context, systemPrompt);
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
