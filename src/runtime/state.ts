import { Annotation } from "@langchain/langgraph";

export const RuntimeState = Annotation.Root({
  userQuery: Annotation<string>(),
  processResult: Annotation<string>(),
  finalResponse: Annotation<string>(),
});

export type RuntimeStateType = typeof RuntimeState.State;