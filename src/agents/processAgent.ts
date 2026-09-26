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

    // console.log("[PROCESS AGENT]", state.userQuery);

    // Include previous messages from state to maintain conversation history
    const previousMessages = state.messages ?? [];
    const messages = [
      new SystemMessage(systemPrompt),
      ...previousMessages,
      new HumanMessage(state.userQuery ?? "")
    ];

    const result = await agent.invoke(
      {
        messages,
      },
      {
        configurable: {
          thread_id: threadId,
        },
      }
    );

    const resultMessages = result?.messages ?? [];
    const finalMessage = resultMessages[resultMessages.length - 1];
    const content =
      typeof finalMessage?.content === "string"
        ? finalMessage.content
        : JSON.stringify(finalMessage?.content ?? "");

    return {
      processResult: content,
      messages: resultMessages, // Save messages back to state for conversation continuity
    };
  };
}
