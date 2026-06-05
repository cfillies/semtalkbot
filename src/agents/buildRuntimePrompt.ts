import { DEFAULT_SYSTEM_PROMPT }
from "./defaultPrompt";


function formatTools(
  tools: any[]
) {

  if (!tools?.length) {
    return "No tools available.";
  }

  return tools
    .map(
      t =>
        `- ${t.name}: ${t.description}`
    )
    .join("\n");
}


function flattenPrompt(
  mcpPrompt: any
): string {

  if (
    !mcpPrompt?.messages?.length
  ) {
    return "";
  }

  return mcpPrompt.messages
    .map((m: any) => {

      if (
        typeof m.content === "string"
      ) {
        return m.content;
      }

      if (m.content?.text) {
        return m.content.text;
      }

      return JSON.stringify(m.content);

    })
    .join("\n\n");
}


export function buildRuntimePrompt(
  mcpPrompt: any,
  tools: any[],
  fallbackPrompt?: string
) {

  // ----------------------------------
  // MCP PROMPT OR FALLBACK
  // ----------------------------------

  let basePrompt =
    flattenPrompt(mcpPrompt);

  if (!basePrompt?.trim()) {

    console.log(
      "[PROMPT] using default fallback prompt"
    );

    basePrompt = DEFAULT_SYSTEM_PROMPT;
  }

  if (fallbackPrompt?.trim()) {
    basePrompt = `${fallbackPrompt.trim()}

${basePrompt}`;
  }

  // ----------------------------------
  // TOOLS
  // ----------------------------------

  const toolText =
    formatTools(tools);

  // ----------------------------------
  // FINAL SYSTEM PROMPT
  // ----------------------------------

  return `
${basePrompt}

-----------------------------------
AVAILABLE TOOLS
-----------------------------------

${toolText}

Use MCP tools whenever
enterprise-specific information
is needed.

Prefer repository data over
general world knowledge.
`;
}