import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { emitRuntimeEvent } from "../runtime/runtimeEvents";

let toolsCache: any[] = [];
const toolClientMap = new Map<string, any>();

export async function buildToolRegistry(clients: any[]) {

  const map = new Map<string, any>();
  toolClientMap.clear();

  for (const client of clients) {
    const res = await client.listTools();

    for (const t of res.tools) {
      if (map.has(t.name)) {
        console.warn(`[MCP] duplicate tool ignored: ${t.name}`);
        continue;
      }

      const schema = z.object({}).passthrough();

      const tool = new DynamicStructuredTool({
        name: t.name,
        description: t.description ?? "MCP tool",
        schema,

        func: async (args: any) => {
          await emitRuntimeEvent({
            type: "tool-start",
            message: `Calling ${t.name}...`,
          });

          // Log the args for debugging duplicate invocations
          console.debug(`[MCP] calling tool ${t.name} with args:`, args);

          const result = await callMcpTool(t.name, args);

          await emitRuntimeEvent({
            type: "tool-end",
            message: `${t.name} completed`,
          });

          const text = result?.content?.[0]?.text;
          return text ?? JSON.stringify(result);
        },
      });

      map.set(t.name, tool);
      toolClientMap.set(t.name, client);
    }
  }

  toolsCache = Array.from(map.values());

  console.log(`[MCP] tools loaded: ${toolsCache.length}`);
}

export function getTools() {
  return toolsCache;
}

export async function callMcpTool(name: string, args: any) {
  const client = toolClientMap.get(name);
  if (!client) {
    throw new Error(`No MCP client registered for tool: ${name}`);
  }

  return client.callTool({
    name,
    arguments: args,
  });
}