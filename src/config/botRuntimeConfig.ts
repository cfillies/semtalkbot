export type BotRuntimeMode = "default" | "json" | "debug";

export type BotRuntimeConfig = {
  mode: BotRuntimeMode;
  definitionFile: string;
};

const DEFAULT_DEFINITION_FILE = "langgraph.json";

const SUPPORTED_MODES: BotRuntimeMode[] = ["default", "json", "debug"];

let runtimeConfig: BotRuntimeConfig = {
  mode: readModeFromEnv(),
  definitionFile: readDefinitionFileFromEnv(),
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
