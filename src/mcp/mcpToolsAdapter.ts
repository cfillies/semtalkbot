import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { emitRuntimeEvent } from "../runtime/runtimeEvents";
// import { getMcpClient } from "./mcpClient";

let toolsCache: any[] = [];

export async function buildToolRegistry(client: any) {

  const res = await client.listTools();
  const map = new Map<string, any>();

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

        const result = await client.callTool({
          name: t.name,
          arguments: args,
        });

        await emitRuntimeEvent({
          type: "tool-end",
          message: `${t.name} completed`,
        });

        const text = result?.content?.[0]?.text;
        return text ?? JSON.stringify(result);
      },
    });

    map.set(t.name, tool);
  }

  toolsCache = Array.from(map.values());

  console.log(`[MCP] tools loaded: ${toolsCache.length}`);
}

export function getTools() {
  return toolsCache;
}