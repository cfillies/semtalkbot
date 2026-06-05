import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let client: Client | null = null;

export async function initMcpClient() {

  if (client) return client;

  const url = process.env.MCP_URL;
  
  if (!url) {
    throw new Error(
      "MCP_URL environment variable not set. Configure it in .localConfigs or your environment."
    );
  }

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