// import { DEFAULT_SYSTEM_PROMPT } from "./defaultPrompt";
import { flattenPromptMessages } from "../mcp/mcpPromptsAdapter";

function formatTools(tools: any[]) {
  if (!tools?.length) {
    return "No tools available.";
  }

  return tools
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join("\n");
}

export function buildRuntimePrompt(
  resolvedUserPrompt: any,
  tools: any[],
  fallbackPrompt?: string
) {
  let basePrompt = flattenPromptMessages(resolvedUserPrompt);

  if (!basePrompt?.trim()) {
    console.log("[PROMPT] using default fallback prompt");
    basePrompt = fallbackPrompt;
  }

  if (fallbackPrompt?.trim()) {
    basePrompt = `${fallbackPrompt.trim()}\n\n${basePrompt}`;
  }

  const toolText = formatTools(tools);

  return `
${basePrompt}

Available tools:
${toolText}

Use MCP tools whenever enterprise-specific information is needed.
Prefer repository data over general world knowledge.

Use Adaptive Cards or MarkDown to format your response.
Only one single answer. Do not mix MarkDown and AdaptiveCards.

Respond in JSON format with the following JSON schema:
{
    "contentType": "AdaptiveCard",
    "content": {The content of the response as JSON based adaptive card}
}

OR

{
    "contentType": "Text",
    "content": "The content of the response as markdown"
}
`;
}
