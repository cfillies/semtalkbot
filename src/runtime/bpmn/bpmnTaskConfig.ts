import { parseTemperature, toStringList, toStringValue } from "../utils";

export type ParsedBpmnTaskConfig = {
  id: string;
  name: string;
  promptTemplate: string;
  cardPayload?: Record<string, any>;
  cardPayloadDefined: boolean;
  systemPrompt: string;
  systemPromptDefined: boolean;
  laneId?: string;
  model?: string;
  modelDefined: boolean;
  temperature?: number;
  temperatureDefined: boolean;
  toolNames: string[];
  toolFilterDefined: boolean;
};

export function parseBpmnTaskConfig(
  task: any,
  globalSystemPrompt: string,
  laneId?: string
) {
  const metadata = task?.["ai:LLMTask"] ?? task?.["ai:Task"] ?? {};

  const promptTemplate =
    toStringValue(metadata.promptTemplate) ??
    `Perform task: ${task?.name ?? task?.id ?? "BPMN task"}`;

  const taskSystemPrompt = toStringValue(metadata.systemPrompt);
  const systemPromptDefined = Object.prototype.hasOwnProperty.call(metadata, "systemPrompt");

  const cardPayloadValue = parseJsonValue(metadata.cardPayload ?? metadata.adaptiveCard ?? metadata.card);
  const cardPayloadDefined =
    Object.prototype.hasOwnProperty.call(metadata, "cardPayload") ||
    Object.prototype.hasOwnProperty.call(metadata, "adaptiveCard") ||
    Object.prototype.hasOwnProperty.call(metadata, "card");

  const modelDefined = Object.prototype.hasOwnProperty.call(metadata, "model");
  const temperatureDefined = Object.prototype.hasOwnProperty.call(metadata, "temperature");
  const toolFilterDefined =
    Object.prototype.hasOwnProperty.call(metadata, "-") ||
    Object.prototype.hasOwnProperty.call(metadata, "toolNames") ||
    Object.prototype.hasOwnProperty.call(metadata, "toolList");

  return {
    id: String(task?.id ?? ""),
    name: String(task?.name ?? task?.id ?? "BPMN task"),
    promptTemplate,
    cardPayload: cardPayloadValue,
    cardPayloadDefined,
    systemPrompt: taskSystemPrompt ?? "",
    systemPromptDefined,
    laneId,
    model: toStringValue(metadata.model),
    modelDefined,
    temperature: parseTemperature(metadata.temperature),
    temperatureDefined,
    toolNames: toStringList(metadata.tools ?? metadata.toolNames ?? metadata.toolList),
    toolFilterDefined,
  } satisfies ParsedBpmnTaskConfig;
}

function parseJsonValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  if (typeof value === "object") {
    return value as Record<string, any>;
  }

  return undefined;
}
