import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let clients: Client[] = [];

export async function initMcpClient() {

  const all = await initMcpClients();
  return all[0];
}

export async function initMcpClients() {

  if (clients.length) return clients;

  const urls = getMcpUrls();
  const initialized: Client[] = [];

  for (const url of urls) {
    const transport = new StreamableHTTPClientTransport(new URL(url));

    const client = new Client(
      {
        name: "semtalk-bot",
        version: "1.0.0",
      }
    );

    await client.connect(transport);
    initialized.push(client);
  }

  clients = initialized;

  console.log(`[MCP] connected clients: ${clients.length}`);

  return clients;
}

function getMcpUrls() {
  const mcpUrls = process.env.MCP_URLS;
  if (mcpUrls?.trim()) {
    const parsed = mcpUrls
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (parsed.length) {
      return parsed;
    }
  }

  if (process.env.MCP_URL?.trim()) {
    return [process.env.MCP_URL.trim()];
  }

  return [
    "https://semaiservice26.azurewebsites.net/runtime/webhooks/mcp" +
      "?code=m6Uw9BvzgbI0if-2xYp3AGIcOGJuLuRtz9_S3FlljXH3AzFusFhMIQ==",
  ];
}

export function getMcpClient() {
  if (!clients.length) throw new Error("MCP client not initialized");
  return clients[0];
}

export function getMcpClients() {
  if (!clients.length) throw new Error("MCP clients not initialized");
  return clients;
}