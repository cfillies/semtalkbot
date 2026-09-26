import { initMcpClients } from "../mcp/mcpClient";
import { buildToolRegistry } from "../mcp/mcpToolsAdapter";
import { loadPromptRegistry } from "../mcp/mcpPromptsAdapter";

export type AppContext = {
  mcpReady: boolean;
};

let defaultBootstrapPromise: Promise<AppContext> | null = null;

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

export async function ensureDefaultModeBootstrap(mode?: string): Promise<AppContext | null> {
  if (mode && mode !== "default") {
    return null;
  }

  if (!defaultBootstrapPromise) {
    console.log("[BOOT] deferred default-mode bootstrap triggered on first use");
    defaultBootstrapPromise = bootstrap();
  }

  return defaultBootstrapPromise;
}
