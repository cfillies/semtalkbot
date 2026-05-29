import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let client: Client | null = null;

export async function initMcpClient() {

  if (client) return client;

  // const url = process.env.MCP_URL!;
  const url = "https://semaiservice26.azurewebsites.net/runtime/webhooks/mcp?code=_m6Uw9BvzgbI0if-2xYp3AGIcOGJuLuRtz9_S3FlljXH3AzFusFhMIQ==";
  //  const url = "http://localhost:707/runtime/webhooks/mcp?code=_m6Uw9BvzgbI0if-2xYp3AGIcOGJuLuRtz9_S3FlljXH3AzFusFhMIQ==";

  const transport = new StreamableHTTPClientTransport(
    new URL(url)
  );

  client = new Client(
    {
      name: "semtalk-bot",
      version: "1.0.0",
    }
  );

  await client.connect(transport);

  console.log("[MCP] connected");

  return client;
}

export function getMcpClient() {
  if (!client) throw new Error("MCP client not initialized");
  return client;
}