export function buildSystemPrompt(tools: any[]) {

  const toolList = tools
    .map(t => `- ${t.name}: ${t.description}`)
    .join("\n");

  return `
You are a process assistant for SemTalk.

Available MCP tools:
${toolList}

Use tools when needed.
Return structured responses.
`;
}