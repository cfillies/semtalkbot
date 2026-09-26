import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { MemorySaver } from "@langchain/langgraph";
import { getTools } from "../mcp/mcpToolsAdapter";
import { getOpenAIApiKey } from "../config/openai";

export function createAgent() {

  const llm = new ChatOpenAI({
    apiKey: getOpenAIApiKey(),
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
