import { createMAFBot as createMAFBot } from "./bot/bot";
import { startServer } from "@microsoft/agents-hosting-express";
import { AgentApplicationBuilder as MAFAgentApplicationBuilder } from "@microsoft/agents-hosting";
import { registerProcessRoutes } from "./api/processRoutes";

async function main() {
  // 4. BOT WRAPPER
  const botHandler = await createMAFBot("debug");

  const mafApp = new MAFAgentApplicationBuilder().build();

  mafApp.onActivity("message", botHandler);
  mafApp.onActivity("invoke", botHandler);

  mafApp.onConversationUpdate("membersAdded", async (ctx) => {
    await ctx.sendActivity("Hello");
  });

  const server = startServer(mafApp);
  registerProcessRoutes(server);

  console.log("[BOT] ready");
}

main().catch(console.error);
