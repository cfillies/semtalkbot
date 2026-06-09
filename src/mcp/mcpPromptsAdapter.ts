import { getMcpClient } from "./mcpClient";

export type McpPromptEntry = {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  [key: string]: any;
};

type PromptRegistry = {
  prompts: McpPromptEntry[];
  loadedAt: number | null;
};

const promptRegistry: PromptRegistry = {
  prompts: [],
  loadedAt: null,
};

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
  "i", "in", "is", "it", "me", "my", "of", "on", "or", "show", "tell",
  "the", "to", "what", "when", "where", "which", "with", "you", "your",
  "der", "die", "das", "ein", "eine", "einer", "einem", "einen", "und",
  "oder", "wie", "was", "wann", "wo", "welche", "welcher", "welches",
  "im", "in", "ist", "sind", "den", "dem", "des", "auf", "fuer", "von",
  "mit", "zu", "zum", "zur", "ich", "du", "er", "sie", "es", "wir", "ihr",
  "bitte", "zeige", "zeigen", "erklaere", "pruefe",
  "analysiere", "analysieren", "ueber", "das", "dass", "denn",
]);

export async function loadPromptRegistry() {
  const client = getMcpClient();
  const result = await client.listPrompts();

  const prompts = Array.isArray(result?.prompts) ? result.prompts : [];
  promptRegistry.prompts = prompts;
  promptRegistry.loadedAt = Date.now();

  console.log(`[PROMPTS] loaded ${promptRegistry.prompts.length}`);
}

export function getPromptRegistry() {
  return promptRegistry.prompts;
}

export function getPromptRegistryMetadata() {
  return {
    loadedAt: promptRegistry.loadedAt,
    count: promptRegistry.prompts.length,
  };
}

export async function resolvePrompt(userMessage: string) {
  const client = getMcpClient();
  const prompts = promptRegistry.prompts;

  if (!prompts.length) {
    return null;
  }

  const selection = rankPromptCandidates(userMessage, prompts)[0];

  if (!selection || selection.score < 0.25) {
    return null;
  }

  const promptArgs = inferPromptArguments(selection.prompt, userMessage);

  console.log(
    `[PROMPT] matched ${selection.prompt.name} (score=${selection.score.toFixed(2)})`
  );

  return await client.getPrompt({
    name: selection.prompt.name,
    arguments: promptArgs,
  });
}

function rankPromptCandidates(userMessage: string, prompts: McpPromptEntry[]) {
  const queryTokens = tokenize(userMessage);
  const queryText = normalizeText(userMessage);

  return prompts
    .map((prompt) => {
      const nameTokens = tokenize(prompt.name);
      const descriptionTokens = tokenize(prompt.description ?? "");
      const argTokens = tokenize(
        (prompt.arguments ?? [])
          .map((arg) => `${arg.name} ${arg.description ?? ""}`)
          .join(" ")
      );

      const candidateTokens = new Set([
        ...nameTokens,
        ...descriptionTokens,
        ...argTokens,
      ]);

      const overlap = queryTokens.filter((token) => candidateTokens.has(token));
      const overlapScore =
        queryTokens.length > 0 ? overlap.length / queryTokens.length : 0;

      const exactNameBonus = queryText.includes(normalizeText(prompt.name))
        ? 0.35
        : 0;

      const exactDescriptionBonus =
        prompt.description && queryText.includes(normalizeText(prompt.description))
          ? 0.2
          : 0;

      const hasProcessHints = promptMatchesProcessHints(prompt);
      const processHintBonus =
        hasProcessHints && queryTokens.some((token) => isPromptIntentToken(token))
          ? 0.1
          : 0;

      const score =
        clamp01(
          overlapScore * 0.7 +
          exactNameBonus +
          exactDescriptionBonus +
          processHintBonus
        );

      return { prompt, score };
    })
    .sort((a, b) => b.score - a.score);
}

function inferPromptArguments(prompt: McpPromptEntry, userMessage: string) {
  const args = prompt.arguments ?? [];

  if (!args.length) {
    return undefined;
  }

  const extractedProcessName = extractProcessName(userMessage);
  const result: Record<string, string> = {};

  for (const arg of args) {
    const key = arg.name;
    const lowered = key.toLowerCase();

    if (lowered.includes("process")) {
      result[key] = extractedProcessName;
      continue;
    }

    if (
      lowered.includes("query") ||
      lowered.includes("text") ||
      lowered.includes("prompt") ||
      lowered.includes("message") ||
      lowered.includes("input") ||
      lowered.includes("topic") ||
      lowered.includes("subject")
    ) {
      result[key] = userMessage;
      continue;
    }

    result[key] = userMessage;
  }

  return Object.keys(result).length ? result : undefined;
}

function extractProcessName(userMessage: string) {
  const cleaned = userMessage
    .replace(/\b(analyze|analyse|review|summarize|summarise|explain|describe|check|inspect)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || userMessage;
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function normalizeText(value: string) {
  return (value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_/.-]+/g, " ")
    .toLowerCase()
    .trim();
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function promptMatchesProcessHints(prompt: McpPromptEntry) {
  const haystack = normalizeText(
    `${prompt.name} ${prompt.description ?? ""} ${
      (prompt.arguments ?? []).map((arg) => arg.name).join(" ")
    }`
  );

  return (
    haystack.includes("process") ||
    haystack.includes("analysis") ||
    haystack.includes("review") ||
    haystack.includes("prozess") ||
    haystack.includes("analyse") ||
    haystack.includes("pruef")
  );
}

function isPromptIntentToken(token: string) {
  return [
    "process",
    "analysis",
    "review",
    "prozess",
    "analyse",
    "pruefen",
    "pruefe",
    "bewerten",
    "erklaeren",
  ].includes(token);
}
