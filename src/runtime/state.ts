import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export const RuntimeState = Annotation.Root({
  userQuery: Annotation<string>(),
  processResult: Annotation<string>(),
  finalResponse: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (current: BaseMessage[], updates: BaseMessage[]) => {
      if (!current) return updates;
      if (!updates) return current;
      return [...current, ...updates];
    },
    default: () => [],
  }),
});

export type RuntimeStateType = typeof RuntimeState.State;