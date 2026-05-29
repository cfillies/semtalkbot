import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { getTools } from "../mcp/mcpToolsAdapter";

export function createAgent() {

  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
  });

  const tools = getTools();

  const checkpointer = new MemorySaver();

  return createReactAgent({
    llm,
    tools,
    checkpointSaver: checkpointer,
  });
}