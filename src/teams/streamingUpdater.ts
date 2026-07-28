import {
  subscribeRuntimeEvents
} from "../runtime/runtimeEvents";
import { parseResponseContent } from "../runtime/responseFormat";

function buildUpdateActivity(context: any,
  sent: any,
  text: string,
  conversationRef: any) {
  let activity: any;

  if (typeof context.activity?.clone === "function") {
    activity = context.activity.clone();
  } else {
    activity = Object.assign(
      Object.create(Object.getPrototypeOf(context.activity || {})),
      context.activity || {}
    );
  }

  if (typeof activity.applyConversationReference === "function") {
    activity.applyConversationReference(conversationRef, false);
  }

  activity.id = sent.id;
  activity.type = "message";
  activity.text = text;
  activity.serviceUrl = conversationRef.serviceUrl;
  activity.conversation = conversationRef.conversation;
  activity.channelId = conversationRef.channelId;
  activity.from = conversationRef.agent;
  activity.recipient = conversationRef.user;

  const parsed = parseResponseContent(text);

  if (parsed.kind === "adaptive_card") {
    activity.attachments = [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: parsed.content,
      },
    ];
    delete activity.text;
  } else {
    delete activity.attachments;
    if (parsed.kind === "text") {
      activity.text = parsed.content;
    } else {
      activity.text = text;
    }
  }

  delete activity.entities;
  delete activity.channelData;
  delete activity.replyToId;
  delete activity.name;
  delete activity.label;

  return activity;
}

export async function createStreamingUpdater(
  context: any
) {

  // Use typing indicator instead of posting state messages to the thread.
  // This avoids cluttering the conversation with transient state messages
  // and prevents toast notifications for intermediate updates.

  // Send an initial persistent status message that we will update.
  let sent: any = null;
  try {
    sent = await context.sendActivity("🧠 Working...");
  } catch (err) {
    console.warn("[STREAM] send initial status failed", err);
    try {
      await context.sendActivity({ type: "typing" });
    } catch (e) {
      console.warn("[STREAM] send typing failed", e);
    }
  }

  const conversationRef =
    typeof context.activity?.getConversationReference === "function"
      ? context.activity.getConversationReference()
      : undefined;
  const channelId = String(context?.activity?.channelId ?? "").toLowerCase();
  const supportsDeleteActivity = channelId !== "emulator";

  let latestText = "";
  let fallbackMode = false;

  const unsubscribe =
    subscribeRuntimeEvents(async (event: any) => {
      latestText = `⚡ ${event.message}`;
      // Try to update the persistent activity in-place.
      try {
        if (!sent || !conversationRef) {
          throw new Error("No persistent activity available");
        }

        const activity = buildUpdateActivity(
          context,
          sent,
          latestText,
          conversationRef
        );

        await context.updateActivity(activity);
      } catch (err) {
        // If updates fail (e.g., unsupported attachments or payload issues), fall back to silent logging
        // and keep showing typing; avoid posting intermediate messages to Teams.
        console.warn("[STREAM UPDATE] update failed", err);
        fallbackMode = true;
      }
    });

  return {

    unsubscribe,

    async complete() {

      try {
        // Remove the transient status activity when we hand off to a card/interrupt.
        try {
          if (supportsDeleteActivity && sent?.id) {
            await context.deleteActivity(sent.id);
          }
        } catch (err) {
          // Some channels/hosts may not support deletion; ignore and continue.
          console.warn("[STREAMER] delete status failed", err);
        }
      } finally {
        unsubscribe();
      }

    },

    async final(
      text: string
    ): Promise<boolean> {

      try {
        // Attempt to replace the persistent status with the final text.
        try {
          if (sent && conversationRef && !fallbackMode) {
            const activity = buildUpdateActivity(
              context,
              sent,
              text,
              conversationRef
            );

            await context.updateActivity(activity);
            return true;
          }
        } catch (err) {
          console.warn("[STREAMER] final update failed", err);
        }

        // Fallback: send the final text as a normal message (may toast).
        try {
          const parsed = parseResponseContent(text);

          if (parsed.kind === "adaptive_card") {
            await context.sendActivity({
              type: "message",
              attachments: [
                {
                  contentType: "application/vnd.microsoft.card.adaptive",
                  content: parsed.content,
                },
              ],
            });
          } else {
            await context.sendActivity({
              type: "message",
              text,
              textFormat: "markdown",
            });
          }
          return true;
        } catch (err) {
          console.warn("[STREAMER] final send failed", err);
        }

        return false;
      } finally {
        unsubscribe();
      }
    }
  };
}
