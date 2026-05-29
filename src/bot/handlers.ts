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
  context: any
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
      tools
    );

  // ---------------------------------------------------
  // INVOKE LANGGRAPH AGENT
  // ---------------------------------------------------

  const streamer = await createStreamingUpdater(context);

  // const result =  await supervisor.invoke({
  //   userQuery:
  //     context.activity.text,
  // });
  // return result.finalResponse;

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



  // ---------------------------------------------------
  // EXTRACT FINAL MESSAGE
  // ---------------------------------------------------

  const finalMessage =
    result.messages[
    result.messages.length - 1
    ];

  await streamer.final(
    finalMessage.content
  );
  return finalMessage.content;
}