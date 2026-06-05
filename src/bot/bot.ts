import { MessageFactory } from "@microsoft/agents-hosting";
import { handleMessage } from "./handlers";

function isAdaptiveCardPayload(payload: any) {
  return (
    payload && typeof payload === "object" &&
    (payload.type === "AdaptiveCard" ||
      (payload.content && payload.content.type === "AdaptiveCard"))
  );
}

export function createBot(agent: any, systemPrompt: string) {

  return async (context: any) => {

    let content: string | null;

    try {
      content = await handleMessage(agent, context, systemPrompt);
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
      const parsed = JSON.parse(content);

      if (isAdaptiveCardPayload(parsed)) {
        const card = parsed.type === "AdaptiveCard" ? parsed : parsed.content;
        return context.sendActivity(
          MessageFactory.attachment({
            contentType: "application/vnd.microsoft.card.adaptive",
            content: card,
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