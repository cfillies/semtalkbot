export type BotRuntimeMode = "default" | "json" | "debug";
export type DocumentHandlingMode = "context" | "rag";

export type BotRuntimeConfig = {
  mode: BotRuntimeMode;
  definitionFile: string;
  documentHandlingMode: DocumentHandlingMode;
};

const DEFAULT_DEFINITION_FILE = "langgraph.json";
const DEFAULT_DOCUMENT_HANDLING_MODE: DocumentHandlingMode = "context";

const SUPPORTED_MODES: BotRuntimeMode[] = ["default", "json", "debug"];
const SUPPORTED_DOCUMENT_MODES: DocumentHandlingMode[] = ["context", "rag"];

let runtimeConfig: BotRuntimeConfig = {
  mode: readModeFromEnv(),
  definitionFile: readDefinitionFileFromEnv(),
  documentHandlingMode: readDocumentHandlingModeFromEnv(),
};

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
    process.env.BOT_DOCUMENT_MODE ??
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
    process.env.BOT_BPMN_MODEL ??
    process.env.BOT_PROCESS_DEFINITION_FILE ??
    process.env.PROCESS_DEFINITION_FILE ??
    DEFAULT_DEFINITION_FILE;

  const normalized = String(raw).trim();
  return normalized || DEFAULT_DEFINITION_FILE;
}

export function getSupportedBotModes() {
  return [...SUPPORTED_MODES];
}

export function getSupportedDocumentModes() {
  return [...SUPPORTED_DOCUMENT_MODES];
}

export function getBotRuntimeConfig(): BotRuntimeConfig {
  return { ...runtimeConfig };
}

export function setBotRuntimeMode(mode: string): BotRuntimeMode {
  const normalized = String(mode).trim().toLowerCase();
  if (!(SUPPORTED_MODES as string[]).includes(normalized)) {
    throw new Error(
      `Unsupported mode: ${mode}. Supported modes: ${SUPPORTED_MODES.join(", ")}`
    );
  }

  runtimeConfig = {
    ...runtimeConfig,
    mode: normalized as BotRuntimeMode,
  };

  return runtimeConfig.mode;
}

export function setDocumentHandlingMode(mode: string): DocumentHandlingMode {
  const normalized = String(mode).trim().toLowerCase();
  if (!(SUPPORTED_DOCUMENT_MODES as string[]).includes(normalized)) {
    throw new Error(
      `Unsupported document mode: ${mode}. Supported modes: ${SUPPORTED_DOCUMENT_MODES.join(", ")}`
    );
  }

  runtimeConfig = {
    ...runtimeConfig,
    documentHandlingMode: normalized as DocumentHandlingMode,
  };

  console.log(`[BOT] document handling mode set to: ${runtimeConfig.documentHandlingMode}`);
  return runtimeConfig.documentHandlingMode;
}

export function setBotDefinitionFile(definitionFile: string): string {
  const normalized = String(definitionFile).trim();
  if (!normalized) {
    throw new Error("Definition file must not be empty.");
  }

  runtimeConfig = {
    ...runtimeConfig,
    definitionFile: normalized,
  };

  return runtimeConfig.definitionFile;
}
