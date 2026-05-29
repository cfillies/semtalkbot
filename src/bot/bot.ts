import { MessageFactory } from "@microsoft/agents-hosting";
import { handleMessage } from "./handlers";

export function createBot(agent: any, systemPrompt: string) {

  return async (context: any) => {

    const content = await handleMessage(agent, context);

    try {
      const parsed = JSON.parse(content);

      return context.sendActivity(
        MessageFactory.attachment({
          contentType: "application/vnd.microsoft.card.adaptive",
          content: parsed.content,
        })
      );

    } catch {

      return context.sendActivity(content);
    }
  };
}