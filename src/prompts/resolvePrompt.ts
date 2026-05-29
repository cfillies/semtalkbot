import { getMcpClient } from "../mcp/mcpClient";

export async function resolvePrompt(
  userMessage: string
) {

  const client = getMcpClient();

  // simplistic example
  // later this becomes semantic routing

  if (
    userMessage.includes("analyze") ||
    userMessage.includes("review")
  ) {

    return await client.getPrompt({

      name: "process-analysis",

      arguments: {
        processName: extractProcessName(userMessage)
      }
    });
  }

  return null;
}

function extractProcessName(um: string) {
  return um;
}