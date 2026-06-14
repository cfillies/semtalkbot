import { parseTemperature, toStringList, toStringValue } from "./utils";

export type ParsedJsonAgentConfig = {
  id: string;
  name: string;
  systemPrompt: string;
  model?: string;
  modelDefined: boolean;
  temperature?: number;
  temperatureDefined: boolean;
  toolNames: string[];
  toolFilterDefined: boolean;
};


export function parseJsonAgentConfig(
  laneOrParticipant: any,
  fallbackSystemPrompt: string
): ParsedJsonAgentConfig {
  const metadata =
    laneOrParticipant?.["attributes"] ??
    {};

  const systemPrompt = [
    fallbackSystemPrompt,
    toStringValue(metadata.systemPrompt),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const modelDefined = metadata.model !== undefined && metadata.model !== "";
  const temperatureDefined = metadata.temperature !== undefined && metadata.temperature !== "";
  const toolFilterDefined = metadata.toolNames !== undefined && metadata.toolNames !== "";

  return {
    id: String(laneOrParticipant?.id ?? ""),
    name: String(laneOrParticipant?.name ?? laneOrParticipant?.id ?? "BPMN agent"),
    systemPrompt: systemPrompt || fallbackSystemPrompt,
    model: toStringValue(metadata.model),
    modelDefined,
    temperature: parseTemperature(metadata.temperature),
    temperatureDefined,
    toolNames: toStringList(metadata.tools ?? metadata.toolNames ?? metadata.toolList),
    toolFilterDefined,
  };
}

export function getAgentNodeKey(agent: ParsedJsonAgentConfig) {
  return `agent:${agent.id}`;
}

export function getLaneNodeKey(laneId: string) {
  return `lane:${laneId}`;
}

export function getTaskLaneId(taskId: string, laneToTaskMap: Map<string, string>) {
  for (const [laneId, mappedTaskId] of laneToTaskMap.entries()) {
    if (mappedTaskId === taskId) {
      return laneId;
    }
  }

  return undefined;
}

