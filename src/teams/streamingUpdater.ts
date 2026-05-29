import {
  subscribeRuntimeEvents
} from "../runtime/runtimeEvents";


export async function createStreamingUpdater(
  context: any
) {

  // initial placeholder message

  const sent =
    await context.sendActivity(
      "🧠 Working..."
    );

  let latestText =
    "🧠 Working...";

  const unsubscribe =
    subscribeRuntimeEvents(

      async (event) => {

        latestText =
          `⚡ ${event.message}`;

        try {

          await context.updateActivity({

            id: sent.id,

            type: "message",

            text: latestText,

          });

        } catch (err) {

          console.warn(
            "[STREAM UPDATE]",
            err
          );
        }
      }
    );

  return {

    unsubscribe,

    async complete() {

      unsubscribe();

    },

    async final(
      text: string
    ) {

      unsubscribe();

      await context.updateActivity({

        id: sent.id,

        type: "message",

        text,

      });
    }
  };
}