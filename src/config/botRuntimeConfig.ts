export type BotRuntimeMode = "default" | "json" | "debug";
export type DocumentHandlingMode = "context" | "rag";

export type BotRuntimeConfig = {
  mode: BotRuntimeMode;
  definitionFile: string;
  modelName: string;
  documentHandlingMode: DocumentHandlingMode;
  enableContextSearch: boolean;
};

const DEFAULT_DEFINITION_FILE = "XXXlanggraph.json";
const DEFAULT_DOCUMENT_HANDLING_MODE: DocumentHandlingMode = "context";
const DEFAULT_ENABLE_CONTEXT_SEARCH = false;
const DEFAULT_MODEL_NAME =  "marketing";

const SUPPORTED_MODES: BotRuntimeMode[] = ["default", "json", "debug"];
const SUPPORTED_DOCUMENT_MODES: DocumentHandlingMode[] = ["context", "rag"];

// Global default config from environment
let globalRuntimeConfig: BotRuntimeConfig = {
  mode: readModeFromEnv(),
  definitionFile: readDefinitionFileFromEnv(),
  modelName: readModelNameFromEnv(),
  documentHandlingMode: readDocumentHandlingModeFromEnv(),
  enableContextSearch: readEnableContextSearchFromEnv(),
};

// Per-thread/conversation config overrides
const threadConfigs = new Map<string, Partial<BotRuntimeConfig>>();

function readModeFromEnv(): BotRuntimeMode {
  const raw =
    process.env.BOT_MODE ??
    process.env.BOT_DEFAULT_MODE ??
    "default";

  const normalized = String(raw).trim().toLowerCase();
  if ((SUPPORTED_MODES as string[]).includes(normalized)) {
    return normalized as BotRuntimeMode;
  }

  console.warn(`[BOT] invalid BOT_MODE \"${raw}\"; using \"default\"`);
  return "default";
}

function readDocumentHandlingModeFromEnv(): DocumentHandlingMode {
  const raw =
    process.env.DOCUMENT_HANDLING_MODE ??
    DEFAULT_DOCUMENT_HANDLING_MODE;

  const normalized = String(raw).trim().toLowerCase();
  if ((SUPPORTED_DOCUMENT_MODES as string[]).includes(normalized)) {
    return normalized as DocumentHandlingMode;
  }

  console.warn(`[BOT] invalid document handling mode \"${raw}\"; using \"${DEFAULT_DOCUMENT_HANDLING_MODE}\"`);
  return DEFAULT_DOCUMENT_HANDLING_MODE;
}

function readDefinitionFileFromEnv(): string {
  const raw =
    process.env.PROCESS_DEFINITION_FILE ??
    DEFAULT_DEFINITION_FILE;

  const normalized = String(raw).trim();
  return normalized || DEFAULT_DEFINITION_FILE;
}
function readModelNameFromEnv(): string {
  const raw =
    process.env.MODEL_NAME ??
    DEFAULT_MODEL_NAME;

  const normalized = String(raw).trim();
  return normalized || DEFAULT_DEFINITION_FILE;
}
function readEnableContextSearchFromEnv(): boolean {
  const raw = process.env.BOT_ENABLE_CONTEXT_SEARCH ?? String(DEFAULT_ENABLE_CONTEXT_SEARCH);
  const normalized = String(raw).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function getSupportedBotModes() {
  return [...SUPPORTED_MODES];
}

export function getSupportedDocumentModes() {
  return [...SUPPORTED_DOCUMENT_MODES];
}

export function getBotRuntimeConfig(threadId?: string): BotRuntimeConfig {
  if (threadId && threadConfigs.has(threadId)) {
    // Merge thread-specific overrides with global config
    const threadOverrides = threadConfigs.get(threadId)!;
    return {
      ...globalRuntimeConfig,
      ...threadOverrides,
    };
  }
  return { ...globalRuntimeConfig };
}

export function setBotRuntimeMode(mode: string, threadId?: string): BotRuntimeMode {
  const normalized = String(mode).trim().toLowerCase();
  if (!(SUPPORTED_MODES as string[]).includes(normalized)) {
    throw new Error(
      `Unsupported mode: ${mode}. Supported modes: ${SUPPORTED_MODES.join(", ")}`
    );
  }

  if (threadId) {
    // Store thread-specific mode
    const threadConfig = threadConfigs.get(threadId) || {};
    threadConfig.mode = normalized as BotRuntimeMode;
    threadConfigs.set(threadId, threadConfig);
    console.log(`[BOT] mode set to "${normalized}" for thread ${threadId}`);
  } else {
    // Update global config
    globalRuntimeConfig = {
      ...globalRuntimeConfig,
      mode: normalized as BotRuntimeMode,
    };
    console.log(`[BOT] global mode set to "${normalized}"`);
  }

  return normalized as BotRuntimeMode;
}

export function setDocumentHandlingMode(mode: string, threadId?: string): DocumentHandlingMode {
  const normalized = String(mode).trim().toLowerCase();
  if (!(SUPPORTED_DOCUMENT_MODES as string[]).includes(normalized)) {
    throw new Error(
      `Unsupported document mode: ${mode}. Supported modes: ${SUPPORTED_DOCUMENT_MODES.join(", ")}`
    );
  }

  if (threadId) {
    const threadConfig = threadConfigs.get(threadId) || {};
    threadConfig.documentHandlingMode = normalized as DocumentHandlingMode;
    threadConfigs.set(threadId, threadConfig);
  } else {
    globalRuntimeConfig = {
      ...globalRuntimeConfig,
      documentHandlingMode: normalized as DocumentHandlingMode,
    };
  }

  console.log(`[BOT] document handling mode set to: ${normalized}${threadId ? ` for thread ${threadId}` : ""}`);
  return normalized as DocumentHandlingMode;
}

export function setBotDefinitionFile(definitionFile: string, threadId?: string): string {
  const normalized = String(definitionFile).trim();
  if (!normalized) {
    throw new Error("Definition file must not be empty.");
  }

  if (threadId) {
    const threadConfig = threadConfigs.get(threadId) || {};
    threadConfig.definitionFile = normalized;
    threadConfigs.set(threadId, threadConfig);
  } else {
    globalRuntimeConfig = {
      ...globalRuntimeConfig,
      definitionFile: normalized,
    };
  }

  return normalized;
}
export function setBotModelName(modelName: string, threadId?: string): string {
  const normalized = String(modelName).trim();
  if (!normalized) {
    throw new Error("modelName must not be empty.");
  }

  if (threadId) {
    const threadConfig = threadConfigs.get(threadId) || {};
    threadConfig.modelName = normalized;
    threadConfigs.set(threadId, threadConfig);
  } else {
    globalRuntimeConfig = {
      ...globalRuntimeConfig,
      modelName: normalized,
    };
  }

  return normalized;
}
export function setEnableContextSearch(enabled: boolean, threadId?: string): boolean {
  if (threadId) {
    const threadConfig = threadConfigs.get(threadId) || {};
    threadConfig.enableContextSearch = enabled;
    threadConfigs.set(threadId, threadConfig);
  } else {
    globalRuntimeConfig = {
      ...globalRuntimeConfig,
      enableContextSearch: enabled,
    };
  }

  console.log(`[BOT] context search ${enabled ? "enabled" : "disabled"}${threadId ? ` for thread ${threadId}` : ""}`);
  return enabled;
}
