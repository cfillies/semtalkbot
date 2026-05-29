import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { emitRuntimeEvent } from "../runtime/runtimeEvents";
// import { getMcpClient } from "./mcpClient";

let toolsCache: any[] = [];

export async function buildToolRegistry(client: any) {

  const res = await client.listTools();

  toolsCache = res.tools.map((t: any) => {

    const schema = z.any(); // can be improved later

    return new DynamicStructuredTool({
      name: t.name,
      description: t.description ?? "MCP tool",
      schema,

      func: async (args: any) => {

        await emitRuntimeEvent({
          type: "tool-start",
          message:
            `Calling ${t.name}...`
        });
        const result = await client.callTool({
          name: t.name,
          arguments: args,
        });

        await emitRuntimeEvent({
          type: "tool-end",
          message:
            `${t.name} completed`
        });
        const text = result?.content?.[0]?.text;

        return text ?? JSON.stringify(result);
      },
    });
  });

  console.log(`[MCP] tools loaded: ${toolsCache.length}`);
}

export function getTools() {
  return toolsCache;
}