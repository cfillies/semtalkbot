import { parseTemperature, toStringList, toStringValue } from "./utils";

export type ParsedJsonTaskConfig = {
  id: string;
  name: string;
  promptTemplate: string;
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

export function parseJsonTaskConfig(
  task: any,
  globalSystemPrompt: string,
  laneId?: string
) {
  const metadata = task?.attributes ?? {};

  const promptTemplate =
    toStringValue(metadata.promptTemplate) ??
    `Perform task: ${task?.name ?? task?.id ?? "BPMN task"}`;

  const taskSystemPrompt = toStringValue(metadata.systemPrompt);
  const systemPromptDefined = metadata.systemPrompt !== undefined && metadata.systemPrompt !== "";

  const modelDefined = metadata.model !== undefined && metadata.model !== "";
  const temperatureDefined = metadata.temperature !== undefined && metadata.temperature !== "";
  const toolFilterDefined = metadata.toolNames !== undefined && metadata.toolNames !== "";

  return {
    id: String(task?.id ?? ""),
    name: String(task?.name ?? task?.id ?? "BPMN task"),
    promptTemplate,
    systemPrompt: taskSystemPrompt ?? "",
    systemPromptDefined,
    laneId,
    model: toStringValue(metadata.model),
    modelDefined,
    temperature: parseTemperature(metadata.temperature),
    temperatureDefined,
    toolNames: toStringList(metadata.tools ?? metadata.toolNames ?? metadata.toolList),
    toolFilterDefined,
  } satisfies ParsedJsonTaskConfig;
}


