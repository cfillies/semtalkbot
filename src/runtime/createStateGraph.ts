import {
  StateGraph,
  START,
  END,
  MemorySaver,
} from "@langchain/langgraph";

import { createProcessAgentNode } from "../agents/processAgent";
import { aggregateNode } from "../agents/aggregateNode";
import { RuntimeState } from "./state";

const inMemoryCheckpointer = new MemorySaver();

export function createProcessStateGraph(
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

  return graph.compile({
    checkpointer: inMemoryCheckpointer,
  });
}
