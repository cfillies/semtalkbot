import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { getOpenAIApiKey } from "../config/openai";
import { ParsedBpmnAgentConfig } from "../runtime/bpmn/bpmnAgentConfig";

export function createBpmnAgent(
  agentConfig: ParsedBpmnAgentConfig,
  tools: any[]
) {
  const llm = new ChatOpenAI({
    apiKey: getOpenAIApiKey(),
    model: agentConfig.model ?? "gpt-4o-mini",
    temperature: agentConfig.temperature ?? 0,
  });

  return createReactAgent({
    llm,
    tools,
    checkpointSaver: new MemorySaver(),
  });
}

