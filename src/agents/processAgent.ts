import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { RuntimeStateType } from "../runtime/state";

export function createProcessAgentNode(
  agent: any,
  systemPrompt: string,
  threadId: string
) {
  return async function processAgentNode(
    state: RuntimeStateType
  ): Promise<Partial<RuntimeStateType>> {

    console.log("[PROCESS AGENT]", state.userQuery);

    const result = await agent.invoke(
      {
        messages: [
          new SystemMessage(systemPrompt),
          new HumanMessage(state.userQuery ?? "")
        ],
      },
      {
        configurable: {
          thread_id: threadId,
        },
      }
    );

    const messages = result?.messages ?? [];
    const finalMessage = messages[messages.length - 1];
    const content =
      typeof finalMessage?.content === "string"
        ? finalMessage.content
        : JSON.stringify(finalMessage?.content ?? "");

    return {
      processResult: content,
    };
  };
}
