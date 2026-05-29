import { bootstrap } from "./bootstrap/bootstrap";
import { createAgent } from "./agents/createAgent";
import { buildSystemPrompt } from "./agents/systemPrompt";
import { createBot } from "./bot/bot";
import { getTools } from "./mcp/mcpToolsAdapter";

import { AgentApplicationBuilder } from "@microsoft/agents-hosting";

async function main() {

  // 1. BOOTSTRAP MCP FIRST
  await bootstrap();

  // 2. CREATE AGENT
  const agent = createAgent();

  // 3. SYSTEM PROMPT
  const systemPrompt = buildSystemPrompt(getTools());

  // 4. BOT WRAPPER
  const botHandler = createBot(agent, systemPrompt);

  // 5. REGISTER BOT
  const app = new AgentApplicationBuilder().build();

  app.onActivity("message", botHandler);

  app.onConversationUpdate("membersAdded", async (ctx) => {
    await ctx.sendActivity("Hello 👋");
  });

  console.log("[BOT] ready");
}

main().catch(console.error);