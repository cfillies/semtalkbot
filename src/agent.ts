import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";
import { ActivityTypes } from "@microsoft/agents-activity";
import {
  AgentApplicationBuilder,
  MessageFactory,
  TurnContext,
} from "@microsoft/agents-hosting";
// import { dateTool } from "./tools/dateTimeTool";
// import { getWeatherTool } from "./tools/getWeatherTool";
import { findProcesses } from "./tools/findProcesses";
import { detailsProcess } from "./tools/detailsProcess";
// import { discoverMcpTools } from "./tools/mcpDiscovery";

export const semtalkAgent = new AgentApplicationBuilder().build();

semtalkAgent.onConversationUpdate(
  "membersAdded",
  async (context: TurnContext) => {
    await context.sendActivity(
      `Hello and Welcome! I'm here to help with all your process model needs!`
    );
  }
);

interface SemTalkProcessAgentResponse {
  contentType: "Text" | "AdaptiveCard";
  content: string;
}

const agentModel = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4o-mini",
  temperature: 0,
});

let agentTools = [findProcesses, detailsProcess];
const agentCheckpointer = new MemorySaver();

// initialize MCP-discovered tools before creating the agent
(async () => {
  // try {
    // const mcpTools = await discoverMcpTools();
    // if (mcpTools.length) {
    //   agentTools = [...agentTools, ...mcpTools];
    // }
    // console.log("Registered agent tools:", agentTools.map((t: any) => ({ name: t.name, description: t.description })));

    // expose tool info for runtime system prompt construction
    // (global as any).__weather_agent_tools_info = agentTools.map((t: any) => ({
    //   name: t.name,
    //   description: t.description ?? "No description provided",
    // }));
  // } catch (e) {
  //   console.warn("Failed to discover MCP tools:", e);
    (global as any).__weather_agent_tools_info = agentTools.map((t: any) => ({
      name: t.name,
      description: t.description ?? "No description provided",
    }));
  // }
 
  // create agent after discovery
  const agent = createReactAgent({
    llm: agentModel,
    tools: agentTools,
    checkpointSaver: agentCheckpointer,
  });
 
  // attach to module-level scope so the rest of this file can use it (the onActivity below uses `agent`)
  (global as any).__semtalk_agent_instance = agent;
})();

// helper to get the created agent instance inside handlers
function getAgentInstance() {
  return (global as any).__semtalk_agent_instance;
}
 
// build a system message that includes discovered tool names & descriptions
function buildSystemMessage(): SystemMessage {
  const tools: { name: string; description: string }[] = (global as any).__weather_agent_tools_info || [];
  const toolsList = tools.length
    ? tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")
    : "- (no external tools registered)";
  return new SystemMessage(`
Du bist ein freundlicher Assistent, der Menschen dabei hilft, Fragen zu Geschäftsprozessen zu beantworten.
Du kannst Folgefragen stellen, bis du genügend Informationen hast, um den betroffenen Geschäftsprozess zu bestimmen und dann die Frage des Kunden zu beantworten,
aber sobald du eine Antwort hast, stelle sicher, dass du sie schön formatiert mit einer adaptiven Karte präsentierst.

Available tools (name: description):
${toolsList}

Respond in JSON format with the following JSON schema, and do not use markdown in the response:

{
    "contentType": "'Text' or 'AdaptiveCard' only",
    "content": "{The content of the response, may be plain text, or JSON based adaptive card}"
`);
}

semtalkAgent.onActivity(ActivityTypes.Message, async (context, state) => {
  const agentInstance = getAgentInstance();
  const sysMessage = buildSystemMessage();
  const llmResponse = await agentInstance.invoke(
    {
      messages: [sysMessage, new HumanMessage(context.activity.text!)],
    },
    {
      configurable: { thread_id: context.activity.conversation!.id },
    }
  );
  let content: string = llmResponse.messages[llmResponse.messages.length - 1].content as string;

  let llmResponseContent: SemTalkProcessAgentResponse = { contentType: "Text", content: content };
  try {
    llmResponseContent = JSON.parse(content);
  } catch (e) {
    console.warn("Failed to parse LLM response as JSON, defaulting to plain text.", e);
  }

  if (llmResponseContent.contentType === "Text") {
    await context.sendActivity(llmResponseContent.content);
  } else if (llmResponseContent.contentType === "AdaptiveCard") {
    const response = MessageFactory.attachment({
      contentType: "application/vnd.microsoft.card.adaptive",
      content: llmResponseContent.content,
    });
    await context.sendActivity(response);
  }
});
