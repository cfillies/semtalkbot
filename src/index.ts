import "./proxy";
import { createMAFBot as createMAFBot } from "./bot/bot";
import { startServer } from "@microsoft/agents-hosting-express";
import { AgentApplicationBuilder as MAFAgentApplicationBuilder } from "@microsoft/agents-hosting";


async function main() {
  // 4. BOT WRAPPER
  const botHandler = await createMAFBot("json");

  const mafApp = new MAFAgentApplicationBuilder().build();

  mafApp.onActivity("message", botHandler);
  mafApp.onActivity("invoke", botHandler);

  mafApp.onConversationUpdate("membersAdded", async (ctx) => {
    await ctx.sendActivity("Hello");
  });

  // Debug: log which instance we're running
  const instanceId = process.env.WEBSITE_INSTANCE_ID || "local-dev";
  const hostname = process.env.COMPUTERNAME || "unknown";
  console.log(`[BOT-STARTUP] Instance: ${instanceId}, Hostname: ${hostname}, MCP_URL: ${process.env.MCP_URL ? "✓ set" : "✗ MISSING"}`);

  startServer(mafApp);


  console.log("[BOT] ready");
}

main().catch(console.error);
