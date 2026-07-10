import { createMAFBot as createMAFBot } from "./bot/bot";
import { startServer } from "@microsoft/agents-hosting-express";
import { AgentApplicationBuilder as MAFAgentApplicationBuilder } from "@microsoft/agents-hosting";

function parseAllowedOrigins() {
  const raw =
    process.env.CORS_ALLOWED_ORIGINS ??
    "http://localhost:3000,http://localhost:5173,http://localhost:7071";

  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

async function main() {
  // 4. BOT WRAPPER
  const botHandler = await createMAFBot();

  const mafApp = new MAFAgentApplicationBuilder().build();

  mafApp.onActivity("message", botHandler);
  mafApp.onActivity("invoke", botHandler);

  mafApp.onConversationUpdate("membersAdded", async (ctx) => {
    await ctx.sendActivity("Hello");
  });

  const server = startServer(mafApp);

  const allowedOrigins = parseAllowedOrigins();
  server.use((req, res, next) => {
    const originHeader = req.headers.origin;
    const origin = Array.isArray(originHeader)
      ? originHeader[0]
      : originHeader;

    if (true || (origin && allowedOrigins.has(origin))) {
      // res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  console.log("[BOT] ready");
}

main().catch(console.error);
