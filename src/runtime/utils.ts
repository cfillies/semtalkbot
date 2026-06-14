export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function getLastText(messages: any[]) {
  const lastMessage = messages?.[messages.length - 1];
  if (typeof lastMessage?.content === "string") {
    return lastMessage.content;
  }

  if (lastMessage?.content && typeof lastMessage.content === "object") {
    return JSON.stringify(lastMessage.content);
  }

  return "";
}

export function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

export function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => toStringList(entry))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  const stringValue = toStringValue(value);
  if (!stringValue) {
    return [];
  }

  return stringValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
export function selectTools(
  allTools: any[],
  allowedToolNames: string[]
) {
  if (!allowedToolNames?.length) {
    // return allTools;
    return [];
  }

  const toolMap = new Map<string, any>();
  for (const tool of allTools ?? []) {
    if (tool?.name) {
      toolMap.set(String(tool.name), tool);
    }
  }

  const selected: any[] = [];
  const missing: string[] = [];

  for (const toolName of allowedToolNames) {
    const tool = toolMap.get(toolName);
    if (tool) {
      selected.push(tool);
    } else {
      missing.push(toolName);
    }
  }

  if (missing.length) {
    console.warn(
      `[BPMN] requested tools not found: ${missing.join(", ")}`
    );
  }

  return selected;
}

export function parseTemperature(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const stringValue = toStringValue(value);
  if (!stringValue) {
    return undefined;
  }

  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? parsed : undefined;
}

