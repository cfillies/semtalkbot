import { initMcpClients } from "../mcp/mcpClient";
import { buildToolRegistry } from "../mcp/mcpToolsAdapter";
import { loadPromptRegistry } from "../mcp/mcpPromptsAdapter";

export type AppContext = {
  mcpReady: boolean;
};

export async function bootstrap(): Promise<AppContext> {

  console.log("[BOOT] starting MCP bootstrap...");

  const mcpClients = await initMcpClients();

  for (const client of mcpClients) {
    await client.ping?.();
  }

  await loadPromptRegistry();
  await buildToolRegistry(mcpClients);

  console.log("[BOOT] MCP ready");

  return {
    mcpReady: true,
  };
}
