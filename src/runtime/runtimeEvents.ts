export type RuntimeEvent = {

  type:
    | "status"
    | "tool-start"
    | "tool-end"
    | "tool-error"
    | "llm";

  message: string;
};


type Listener =
  (event: RuntimeEvent)
    => Promise<void>;

let listeners: Listener[] = [];


export function subscribeRuntimeEvents(
  listener: Listener
) {

  listeners.push(listener);

  return () => {

    listeners =
      listeners.filter(
        l => l !== listener
      );
  };
}


export async function emitRuntimeEvent(
  event: RuntimeEvent
) {

  for (const listener of listeners) {

    try {

      await listener(event);

    } catch (err) {

      console.warn(
        "[EVENT BUS]",
        err
      );
    }
  }
}