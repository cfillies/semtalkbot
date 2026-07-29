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

  console.log("[STARTUP] Registering message activity handler");
  mafApp.onActivity("message", async (ctx) => {
    console.log("[ACTIVITY] Message activity received from:", ctx?.activity?.from?.name, "text:", ctx?.activity?.text?.substring(0, 50));
    try {
      return await botHandler(ctx);
    } catch (err) {
      console.error("[ACTIVITY] Handler threw exception:", err instanceof Error ? err.message : String(err));
      throw err;
    }
  });

  console.log("[STARTUP] Registering invoke activity handler");
  mafApp.onActivity("invoke", async (ctx) => {
    console.log("[ACTIVITY] Invoke activity received, name:", ctx?.activity?.name);
    try {
      return await botHandler(ctx);
    } catch (err) {
      console.error("[ACTIVITY] Handler threw exception:", err instanceof Error ? err.message : String(err));
      throw err;
    }
  });

  mafApp.onConversationUpdate("membersAdded", async (ctx) => {
    console.log("[STARTUP] Member added");
    await ctx.sendActivity("Hello");
  });

  // Debug: log which instance we're running
  const instanceId = process.env.WEBSITE_INSTANCE_ID || "local-dev";
  const hostname = process.env.COMPUTERNAME || "unknown";
  console.log(`[BOT-STARTUP] Instance: ${instanceId}, Hostname: ${hostname}, MCP_URL: ${process.env.MCP_URL ? "✓ set" : "✗ MISSING"}`);

  const server = startServer(mafApp);

  const allowedOrigins = parseAllowedOrigins();
  
  // Log ALL incoming requests
  server.use((req, res, next) => {
    console.log("[EXPRESS] Incoming request:", {
      method: req.method,
      path: req.path,
      url: req.url,
      headers: {
        authorization: req.headers.authorization ? "***" : "MISSING",
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent']?.substring(0, 50)
      }
    });
    next();
  });
  
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
