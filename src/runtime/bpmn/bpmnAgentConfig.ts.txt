import { parseTemperature, toStringList, toStringValue } from "../utils";

export type ParsedBpmnAgentConfig = {
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

export function parseBpmnAgentConfig(
  laneOrParticipant: any,
  fallbackSystemPrompt: string
): ParsedBpmnAgentConfig {
  const metadata =
    laneOrParticipant?.["ai:Agent"] ??
    laneOrParticipant?.["ai:Participant"] ??
    laneOrParticipant?.["ai:LLMAgent"] ??
    {};

  const systemPrompt = [
    fallbackSystemPrompt,
    toStringValue(metadata.systemPrompt),
  ]
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

export function getAgentNodeKey(agent: ParsedBpmnAgentConfig) {
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

