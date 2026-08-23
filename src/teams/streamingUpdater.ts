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

  const isCopilot = context?.activity?.channelData?.productContext === 'COPILOT';

  let sent: any = null;
  if (!isCopilot) {
    try {
      console.log("[STREAM] attempting to send initial status message");
      sent = await context.sendActivity("🧠 Working...");
      console.log("[STREAM] initial status sent:", sent?.id);
    } catch (err) {
      console.error("[STREAM] send initial status FAILED:", err);
      try {
        console.log("[STREAM] attempting fallback typing indicator");
        await context.sendActivity({ type: "typing" });
        console.log("[STREAM] typing indicator sent");
      } catch (e) {
        console.error("[STREAM] send typing FAILED:", e);
      }
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
      if (isCopilot) return;
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


      console.log("[STREAMER] final() called with text length:", text?.length ?? 0);

      try {
        // Attempt to replace the persistent status with the final text.
        try {
          if (sent && conversationRef && !fallbackMode) {
            console.log("[STREAMER] attempting to update persistent activity, sent.id:", sent?.id);
            const activity = buildUpdateActivity(
              context,
              sent,
              text,
              conversationRef
            );
            // if (isCopilot) {
            //   await context.sendActivity(text);
            //   return true;
            // }
            console.log("[STREAMER] calling updateActivity with:", {
              activityId: activity?.id,
              type: activity?.type,
              hasText: !!activity?.text,
              hasAttachments: !!activity?.attachments
            });
            await context.updateActivity(activity);
            console.log("[STREAMER] persistent activity update successful");
            return true;
          } else {
            if (!isCopilot) {
              console.log("[STREAMER] cannot update persistent - sent:", !!sent, "conversationRef:", !!conversationRef, "fallbackMode:", fallbackMode);
            }
          }
        } catch (err) {
          console.warn("[STREAMER] final update failed:", {
            message: err instanceof Error ? err.message : String(err),
            hasContext: !!context,
            contextType: typeof context,
            sent: sent ? { id: sent.id } : null
          });
        }

        // Fallback: send the final text as a normal message (may toast).
        console.log("[STREAMER] using fallback send");
        try {
          const parsed = parseResponseContent(text);

          if (parsed.kind === "adaptive_card") {
            console.log("[STREAMER] sending adaptive card, size:", JSON.stringify(parsed.content).length);
            const activity = {
              type: "message",
              attachments: [
                {
                  contentType: "application/vnd.microsoft.card.adaptive",
                  content: parsed.content,
                },
              ],
            };
            console.log("[STREAMER] calling sendActivity for adaptive card");
            const result = await context.sendActivity(activity);
            console.log("[STREAMER] adaptive card sent, result:", result?.id ? `✓ ${result.id}` : "no result id");
          } else {
            console.log("[STREAMER] sending text message, text length:", text?.length);
            const activity = {
              type: "message",
              text,
              textFormat: "markdown",
            };
            console.log("[STREAMER] calling sendActivity for text");
            const result = await context.sendActivity(activity);
            console.log("[STREAMER] text message sent, result:", result?.id ? `✓ ${result.id}` : "no result id");
          }
          console.log("[STREAMER] fallback send successful");
          return true;
        } catch (err) {
          console.error("[STREAMER] final send FAILED:", {
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack?.split('\n')[0] : undefined,
            contextKeys: context ? Object.keys(context).slice(0, 5) : "no context",
            contextHasSendActivity: typeof context?.sendActivity === "function"
          });
        }

        return false;
      } finally {
        unsubscribe();
      }
    }
  };
}
