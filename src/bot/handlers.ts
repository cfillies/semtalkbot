// import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// export async function handleMessage(agent: any, context: any, systemPrompt: string) {


//   const result = await agent.invoke(
//     {
//       messages: [
//         new SystemMessage(systemPrompt),
//         new HumanMessage(context.activity.text),
//       ],
//     },
//     {
//       configurable: {
//         thread_id: context.activity.conversation.id,
//       },
//     }
//   );

//   return result.messages.at(-1)?.content;
// }

// /bot/handlers.ts

import {
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

import { resolvePrompt }
  from "../prompts/resolvePrompt";

import { buildRuntimePrompt }
  from "../agents/buildRuntimePrompt";

import { getTools }
  from "../mcp/mcpToolsAdapter";

import { createStreamingUpdater }
  from "../teams/streamingUpdater";
import {
  createSupervisorGraph
}
  from "../runtime/createSupervisorGraph";

const supervisor =
  createSupervisorGraph();

// -----------------------------------------------------
// Main Bot Message Handler
// -----------------------------------------------------

export async function handleMessage(
  agent: any,
  context: any,
  topLevelPrompt: string
) {

  // ---------------------------------------------------
  // USER INPUT
  // ---------------------------------------------------

  const userText =
    context.activity.text ?? "";

  console.log(
    "[USER]",
    userText
  );

  // ---------------------------------------------------
  // GET RUNTIME TOOLS
  // ---------------------------------------------------

  const tools =
    getTools();

  console.log(
    `[TOOLS] ${tools.length} loaded`
  );

  // ---------------------------------------------------
  // RESOLVE MCP PROMPT
  // ---------------------------------------------------

  let mcpPrompt = null;

  try {

    mcpPrompt =
      await resolvePrompt(userText);

    if (mcpPrompt) {

      console.log(
        "[PROMPT]",
        mcpPrompt.description ??
        "resolved"
      );
    }

  } catch (err) {

    console.warn(
      "[PROMPT] resolution failed",
      err
    );
  }

  // ---------------------------------------------------
  // BUILD FINAL SYSTEM PROMPT
  // ---------------------------------------------------

  const systemPrompt =
    buildRuntimePrompt(
      mcpPrompt,
      tools,
      topLevelPrompt
    );

  // ---------------------------------------------------
  // INVOKE LANGGRAPH AGENT
  // ---------------------------------------------------

  const streamer = await createStreamingUpdater(context);

  try {
    const result =
      await agent.invoke(
        {
          messages: [

            new SystemMessage(
              systemPrompt
            ),

            new HumanMessage(
              userText
            ),
          ],
        },
        {
          configurable: {
            thread_id:
              context.activity
                .conversation?.id
              ?? "default",
          },
        }
      );

    const finalMessage =
      result?.messages?.[
        result.messages.length - 1
      ];

    const content =
      finalMessage?.content ??
      "Sorry, I did not receive a response from the agent.";

    const posted = await streamer.final(content);
    return posted ? null : content;
  } catch (err) {
    console.error("[AGENT] invoke failed", err);
    try {
      await streamer.complete();
    } catch (streamError) {
      console.warn("[STREAMER] complete failed", streamError);
    }
    return "Sorry, I encountered an internal error while generating the response. Please try again.";
  }
}