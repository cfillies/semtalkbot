import { bootstrap } from "./bootstrap/bootstrap";
import { createAgent } from "./agents/createAgent";
// import { buildSystemPrompt } from "./agents/systemPrompt";
import { createMAFBot as createMAFBot } from "./bot/bot";
// import { getTools } from "./mcp/mcpToolsAdapter";
import { startServer } from "@microsoft/agents-hosting-express";

import { AgentApplicationBuilder as MAFAgentApplicationBuilder } from "@microsoft/agents-hosting";
import { DEFAULT_SYSTEM_PROMPT } from "./agents/defaultPrompt";
async function main() {

  // 1. BOOTSTRAP MCP FIRST
  await bootstrap();

  // 2. CREATE AGENT
  const langgraph_reactagent = createAgent();

  // 3. SYSTEM PROMPT
  // const systemPrompt = buildSystemPrompt(getTools());
  const systemPrompt = DEFAULT_SYSTEM_PROMPT;

  // 4. BOT WRAPPER
  const botHandler = createMAFBot(langgraph_reactagent, systemPrompt);

  const mafApp = new MAFAgentApplicationBuilder().build();

  mafApp.onActivity("message", botHandler);

  mafApp.onConversationUpdate("membersAdded", async (ctx) => {
    await ctx.sendActivity("Hello 👋");
  });

  startServer(mafApp);

  console.log("[BOT] ready");
}

main().catch(console.error);