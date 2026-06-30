import { parseTemperature, toStringList, toStringValue } from "./utils";

export enum SemTalkAssignment {
    assignment = "=",
    increment = "+=",
    decrement = "-=",
    new = " = new",
    delete = "delete",
    push = "push",
    pop = "pop",
    remove = "remove",
    append = "append",
    alert = "alert",
    debug = "debug",
    log = "log",
    random = "random"
}
export enum SemTalkOperator {
    eq = '==',
    ne = '!=',
    gt = '>',
    lt = '<',
    ge = '>=',
    le = '<=',
    in = 'in',
    ni = 'not in',
    is = 'is',
    isnot = 'is not',
    // like = 'like',
    // notlike = 'not like',
    and = 'and',
    or = 'or',
    not = 'not',
    startswith = 'startswith',
    endswith = 'endswith',
    contains = 'contains'
    // between = 'between',
    // notbetween = 'not between',
    // inlist = 'inlist',
    // notinlist = 'not inlist',
    // inrange = 'inrange',
    // notinrange = 'not inrange'
}
export interface IExpression {
    var: string;
    op: SemTalkOperator | SemTalkAssignment;
    val: string;
}
export type ParsedJsonTaskConfig = {
  id: string;
  name: string;
  tasktype: string;
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
  inputs: string[];
  outputs: string[];
  AssignmentExpression: IExpression[]
};

export function parseJsonTaskConfig(
  task: any,
  _globalSystemPrompt: string,
  laneId?: string
) {
  const metadata = task?.attributes ?? {};

  const promptTemplate =
    toStringValue(metadata.promptTemplate) ??
    `Perform task: ${task?.name ?? task?.id ?? "BPMN task"}`;

  const taskSystemPrompt = toStringValue(metadata.systemPrompt);
  const systemPromptDefined = metadata.systemPrompt !== undefined && metadata.systemPrompt !== "";

  const cardPayloadValue = parseJsonValue(metadata.cardPayload ?? metadata.adaptiveCard ?? metadata.card);
  const cardPayloadDefined =
    metadata.cardPayload !== undefined ||
    metadata.adaptiveCard !== undefined ||
    metadata.card !== undefined;

  const modelDefined = metadata.model !== undefined && metadata.model !== "";
  const temperatureDefined = metadata.temperature !== undefined && metadata.temperature !== "";
  const toolFilterDefined = metadata.toolNames !== undefined && metadata.toolNames !== "";
  const assignmentExpression: IExpression[] = metadata.AssignmentExpression != undefined ? JSON.parse(metadata.AssignmentExpression) : [];

  return {
    id: String(task?.id ?? ""),
    name: String(task?.name ?? task?.id ?? "BPMN task"),
    tasktype: String(task?.tasktype ?? "None"),
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
    inputs: task.inputs,
    outputs: task.outputs,
    AssignmentExpression:assignmentExpression,
  } satisfies ParsedJsonTaskConfig;
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


