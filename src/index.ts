import { bootstrap } from "./bootstrap/bootstrap";
import { createMAFBot as createMAFBot } from "./bot/bot";
import { startServer } from "@microsoft/agents-hosting-express";
import { AgentApplicationBuilder as MAFAgentApplicationBuilder } from "@microsoft/agents-hosting";

async function main() {

  
  // 4. BOT WRAPPER
  const botHandler = await createMAFBot("json");

  const mafApp = new MAFAgentApplicationBuilder().build();

  mafApp.onActivity("message", botHandler);

  mafApp.onConversationUpdate("membersAdded", async (ctx) => {
    await ctx.sendActivity("Hello 👋");
  });

  startServer(mafApp);

  console.log("[BOT] ready");
}

main().catch(console.error);