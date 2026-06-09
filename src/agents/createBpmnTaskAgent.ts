import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { getOpenAIApiKey } from "../config/openai";
import { ParsedBpmnTaskConfig } from "../runtime/bpmnTaskConfig";

export function createBpmnTaskAgent(
  task: ParsedBpmnTaskConfig,
  tools: any[]
) {
  const llm = new ChatOpenAI({
    apiKey: getOpenAIApiKey(),
    model: task.model ?? "gpt-4o-mini",
    temperature: task.temperature ?? 0,
  });

  return createReactAgent({
    llm,
    tools,
    checkpointSaver: new MemorySaver(),
  });
}

