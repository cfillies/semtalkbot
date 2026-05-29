export function formatTools(tools: any[]) {

  if (!tools.length) {
    return "No tools available.";
  }

  return tools
    .map((t) =>
      `- ${t.name}: ${t.description}`
    )
    .join("\n");
}