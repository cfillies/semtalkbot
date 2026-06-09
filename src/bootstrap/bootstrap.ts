import { initMcpClient } from "../mcp/mcpClient";
import { buildToolRegistry } from "../mcp/mcpToolsAdapter";
import { loadPromptRegistry } from "../mcp/mcpPromptsAdapter";

export type AppContext = {
  mcpReady: boolean;
};

export async function bootstrap(): Promise<AppContext> {

  console.log("[BOOT] starting MCP bootstrap...");

  const mcpClient = await initMcpClient();

  await mcpClient.ping?.();

  await buildToolRegistry(mcpClient);
  await loadPromptRegistry();

  console.log("[BOOT] MCP ready");

  return {
    mcpReady: true,
  };
}
