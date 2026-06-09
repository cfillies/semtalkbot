import {
  StateGraph,
  START,
  END,
} from "@langchain/langgraph";

import { RuntimeState } from "./state";
import { createProcessAgentNode } from "../agents/processAgent";
import { aggregateNode } from "../agents/aggregateNode";

export function createSupervisorGraph(
  agent: any,
  systemPrompt: string,
  threadId: string
) {
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
