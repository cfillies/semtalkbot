export interface RoutedTool {
  tool: any;
  score: number;
}

import OpenAI from "openai";
import { getOpenAIApiKey } from "../config/openai";

const openai = new OpenAI({
  apiKey: getOpenAIApiKey(),
});

export async function routeTools(
  userQuery: string,
  allTools: any[]
) {

  const toolDescriptions =
    allTools.map((t, i) =>
      `${i}. ${t.name}: ${t.description}`
    ).join("\n");

  const prompt = `
Select the 3 most relevant tools.

User query:
${userQuery}

Tools:
${toolDescriptions}

Return ONLY indices as JSON array.
`;

  const response =
    await openai.chat.completions.create({

      model: "gpt-4o-mini",

      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

  const indices =
    JSON.parse(
      response.choices[0].message.content!
    );

  return indices.map((i: number) => allTools[i]);
}
