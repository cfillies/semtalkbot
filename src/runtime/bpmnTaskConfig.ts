export type ParsedBpmnTaskConfig = {
  id: string;
  name: string;
  promptTemplate: string;
  systemPrompt: string;
  model?: string;
  modelDefined: boolean;
  temperature?: number;
  temperatureDefined: boolean;
  toolNames: string[];
  toolFilterDefined: boolean;
};

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function toStringList(value: unknown): string[] {
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

function parseTemperature(value: unknown): number | undefined {
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

export function parseBpmnTaskConfig(task: any, globalSystemPrompt: string) {
  const metadata = task?.["ai:LLMTask"] ?? task?.["ai:Task"] ?? {};

  const promptTemplate =
    toStringValue(metadata.promptTemplate) ??
    `Perform task: ${task?.name ?? task?.id ?? "BPMN task"}`;

  const taskSystemPrompt = toStringValue(metadata.systemPrompt);
  const combinedSystemPrompt = [globalSystemPrompt, taskSystemPrompt]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const modelDefined = Object.prototype.hasOwnProperty.call(metadata, "model");
  const temperatureDefined = Object.prototype.hasOwnProperty.call(metadata, "temperature");
  const toolFilterDefined =
    Object.prototype.hasOwnProperty.call(metadata, "tools") ||
    Object.prototype.hasOwnProperty.call(metadata, "toolNames") ||
    Object.prototype.hasOwnProperty.call(metadata, "toolList");

  return {
    id: String(task?.id ?? ""),
    name: String(task?.name ?? task?.id ?? "BPMN task"),
    promptTemplate,
    systemPrompt: combinedSystemPrompt,
    model: toStringValue(metadata.model),
    modelDefined,
    temperature: parseTemperature(metadata.temperature),
    temperatureDefined,
    toolNames: toStringList(metadata.tools ?? metadata.toolNames ?? metadata.toolList),
    toolFilterDefined,
  } satisfies ParsedBpmnTaskConfig;
}

export function selectTools(
  allTools: any[],
  allowedToolNames: string[]
) {
  if (!allowedToolNames?.length) {
    return allTools;
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

