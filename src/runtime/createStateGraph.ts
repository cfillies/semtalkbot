import {
  StateGraph,
  START,
  END,
} from "@langchain/langgraph";

import { createProcessAgentNode } from "../agents/processAgent";
import { aggregateNode } from "../agents/aggregateNode";
import { Annotation } from "@langchain/langgraph";

const RuntimeState = Annotation.Root({
  userQuery: Annotation<string>(),
  processResult: Annotation<string>(),
  finalResponse: Annotation<string>(),
});

export function createStateGraph(
  agent: any,
  systemPrompt: string,
  threadId: string) {
  const graph = new StateGraph(RuntimeState)
    .addNode(
      "processAgent",
      createProcessAgentNode(agent, systemPrompt, threadId)
    )
    .addNode("aggregate", aggregateNode)
    .addEdge(START, "processAgent")
    .addEdge("processAgent", "aggregate")
    .addEdge("aggregate", END);

  return graph.compile();
}
