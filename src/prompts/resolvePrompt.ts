import { resolvePrompt as resolveSemanticPrompt } from "../mcp/mcpPromptsAdapter";

export async function resolvePrompt(userMessage: string) {
  return await resolveSemanticPrompt(userMessage);
}
