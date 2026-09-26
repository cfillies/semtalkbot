export function extractAdaptiveCard(payload: any) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (payload.type === "AdaptiveCard") {
    return payload;
  }

  if (
    payload.contentType === "AdaptiveCard" &&
    payload.content &&
    typeof payload.content === "object"
  ) {
    return payload.content;
  }

  if (
    payload.content &&
    typeof payload.content === "object" &&
    payload.content.type === "AdaptiveCard"
  ) {
    return payload.content;
  }

  return null;
}

export function parseResponseContent(text: string) {
  if (!text) {
    return { kind: "text" as const, content: "" };
  }

  const trimmed = text.trim();
  const looksJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));

  if (!looksJson) {
    return { kind: "text" as const, content: text };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const adaptiveCard = extractAdaptiveCard(parsed);

    if (adaptiveCard) {
      return { kind: "adaptive_card" as const, content: adaptiveCard };
    }
    if (parsed.contentType === "Text") {
      return {
        kind: "text" as const,
        content: parsed.content
      };
    }
  } catch (err) {
    // Not valid JSON, fall through to text.
  }

return { kind: "text" as const, content: text };
}
