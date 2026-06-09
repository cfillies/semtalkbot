import { bootstrap } from "./bootstrap/bootstrap";
import { createAgent } from "./agents/createAgent";
import { buildSystemPrompt } from "./agents/systemPrompt";
import { createBot } from "./bot/bot";
// import { getTools } from "./mcp/mcpToolsAdapter";
import { startServer } from "@microsoft/agents-hosting-express";

import { AgentApplicationBuilder } from "@microsoft/agents-hosting";
import { DEFAULT_SYSTEM_PROMPT } from "./agents/defaultPrompt";
async function main() {

  // 1. BOOTSTRAP MCP FIRST
  await bootstrap();

  // 2. CREATE AGENT
  const agent = createAgent();

  // 3. SYSTEM PROMPT
  // const systemPrompt = buildSystemPrompt(getTools());
  const systemPrompt = DEFAULT_SYSTEM_PROMPT;

  // 4. BOT WRAPPER
  const botHandler = createBot(agent, systemPrompt);

  const app = new AgentApplicationBuilder().build();

  app.onActivity("message", botHandler);

  app.onConversationUpdate("membersAdded", async (ctx) => {
    await ctx.sendActivity("Hello 👋");
  });

  startServer(app);

  console.log("[BOT] ready");
}

main().catch(console.error);