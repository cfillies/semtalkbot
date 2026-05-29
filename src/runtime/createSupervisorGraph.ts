import {
  StateGraph,
  START,
  END,
} from "@langchain/langgraph";

import { RuntimeState } from "./state";
import { processAgentNode } from "../agents/processAgent";
import { aggregateNode } from "../agents/aggregateNode";

export function createSupervisorGraph() {

  // ✅ CRITICAL FIX: MUST pass Annotation Root, NOT plain object
  const graph = new StateGraph(RuntimeState)
    .addNode("processAgent", processAgentNode)
    .addNode("aggregate", aggregateNode)
    .addEdge(START, "processAgent")
    .addEdge("processAgent", "aggregate")
    .addEdge("aggregate", END);

  return graph.compile();
}