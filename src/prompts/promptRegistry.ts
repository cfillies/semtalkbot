import { getMcpClient } from "../mcp/mcpClient";

let prompts: any[] = [];

export async function loadPrompts() {

  const client = getMcpClient();

  const result = await client.listPrompts();

  prompts = result.prompts;

  console.log(
    `[PROMPTS] loaded ${prompts.length}`
  );
}

export function getPrompts() {
  return prompts;
}