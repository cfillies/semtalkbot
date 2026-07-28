import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { emitRuntimeEvent } from "../runtime/runtimeEvents";

let toolsCache: any[] = [];
const toolClientMap = new Map<string, any>();

/**
 * Convert a JSON Schema to a Zod schema
 * Handles basic types: string, number, boolean, object, array
 */
function jsonSchemaToZod(schema: any): z.ZodType<any> {
  if (!schema || typeof schema !== "object") {
    return z.any();
  }

  const type = schema.type;

  switch (type) {
    case "string":
      return z.string().describe(schema.description || "");
    case "number":
      return z.number().describe(schema.description || "");
    case "integer":
      return z.number().int().describe(schema.description || "");
    case "boolean":
      return z.boolean().describe(schema.description || "");
    case "array":
      const itemSchema = schema.items ? jsonSchemaToZod(schema.items) : z.any();
      return z.array(itemSchema).describe(schema.description || "");
    case "object": {
      const properties = schema.properties || {};
      const zodObj: Record<string, z.ZodType<any>> = {};
      
      for (const [key, prop] of Object.entries(properties)) {
        const propSchema = jsonSchemaToZod(prop);
        const isRequired = schema.required && schema.required.includes(key);
        zodObj[key] = isRequired ? propSchema : propSchema.optional();
      }
      
      return z.object(zodObj).describe(schema.description || "");
    }
    default:
      return z.any();
  }
}


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

      // Convert MCP input schema to Zod schema
      let schema: any = z.object({}).passthrough();
      if (t.inputSchema) {
        try {
          schema = jsonSchemaToZod(t.inputSchema);
          console.log(`[MCP] tool "${t.name}" schema built from inputSchema`);
        } catch (err) {
          console.warn(`[MCP] failed to convert inputSchema for ${t.name}, using passthrough`, err);
        }
      } else {
        console.warn(`[MCP] tool "${t.name}" has no inputSchema, using passthrough`);
      }

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

          try {
            const result = await callMcpTool(t.name, args);

            await emitRuntimeEvent({
              type: "tool-end",
              message: `${t.name} completed`,
            });

            const text = result?.content?.[0]?.text;
            return text ?? JSON.stringify(result);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[MCP] tool ${t.name} failed:`, errorMessage);

            await emitRuntimeEvent({
              type: "tool-error",
              message: `${t.name} failed: ${errorMessage}`,
            });

            // Return error message to LLM for context
            return `Tool error: ${errorMessage}`;
          }
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

  // Prevent calling "find*" tools without arguments
  if (name.toLowerCase().startsWith("find") && (!args || Object.keys(args).length === 0)) {
    throw new Error(`Cannot call tool "${name}" without arguments - search tools require parameters`);
  }

  return client.callTool({
    name,
    arguments: args,
  });
}