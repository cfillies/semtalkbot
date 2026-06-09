import { XMLParser } from "fast-xml-parser";
import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getTools } from "../mcp/mcpToolsAdapter";
import { createBpmnTaskAgent } from "../agents/createBpmnTaskAgent";
import {
  parseBpmnTaskConfig,
  selectTools,
  type ParsedBpmnTaskConfig,
} from "./bpmnTaskConfig";

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getLastText(messages: any[]) {
  const lastMessage = messages?.[messages.length - 1];
  if (typeof lastMessage?.content === "string") {
    return lastMessage.content;
  }

  if (lastMessage?.content && typeof lastMessage.content === "object") {
    return JSON.stringify(lastMessage.content);
  }

  return "";
}

function buildGatewayRoute(gatewayId: string, flows: any[]) {
  return (state: any) => {
    const lastText = getLastText(state.messages).toLowerCase();
    const outgoing = flows.filter((flow: any) => flow.sourceRef === gatewayId);

    for (const flow of outgoing) {
      if (flow.name && lastText.includes(String(flow.name).toLowerCase())) {
        return flow.targetRef;
      }
    }

    return outgoing[0]?.targetRef ?? END;
  };
}

function createTaskNode(
  task: ParsedBpmnTaskConfig,
  sharedAgent: any,
  globalSystemPrompt: string,
  threadId: string,
  availableTools: any[]
) {
  const requiresDedicatedAgent =
    task.modelDefined ||
    task.temperatureDefined ||
    task.toolFilterDefined;

  const taskTools = selectTools(
    availableTools,
    task.toolNames
  );

  const agent =
    !requiresDedicatedAgent && sharedAgent
      ? sharedAgent
      : createBpmnTaskAgent(task, taskTools);

  return async (state: any) => {
    const historyMessages = Array.isArray(state.messages)
      ? state.messages
      : [];

    const response = await agent.invoke(
      {
        messages: [
          new SystemMessage(task.systemPrompt || globalSystemPrompt),
          ...historyMessages,
          new HumanMessage(
            [
              `BPMN task: ${task.name}`,
              task.promptTemplate,
            ]
              .filter(Boolean)
              .join("\n\n")
          ),
        ],
      },
      {
        configurable: {
          thread_id: `${threadId}:${task.id}`,
        },
      }
    );

    const messages = response?.messages ?? [];
    const finalMessage = messages[messages.length - 1];

    return {
      messages: finalMessage ? [finalMessage] : [],
    };
  };
}

export function createBPMNStateGraph(
  xml: string,
  agent: any,
  systemPrompt: string,
  threadId: string
) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });
  const bpmn = parser.parse(xml);
  const process = bpmn.definitions.process;

  const tasks = asArray(process.task);
  const gateways = asArray(process.exclusiveGateway);
  const startEvents = asArray(process.startEvent);
  const endEvents = asArray(process.endEvent);
  const flows = asArray(process.sequenceFlow);
  const availableTools = getTools();

  const StateAnnotation = Annotation.Root({
    ...MessagesAnnotation.spec,
    userQuery: Annotation<string>(),
    finalResponse: Annotation<string>(),
    processVariables: Annotation<{
      global: Record<string, any>;
      local: Record<string, any>;
    }>(),
  });

  let graph: any = new StateGraph(StateAnnotation);

  graph = graph.addNode("seed_input", async (state: any) => ({
    messages: state.userQuery
      ? [new HumanMessage(state.userQuery)]
      : [],
  }));

  graph = graph.addEdge(START, "seed_input");

  for (const startEvent of startEvents) {
    graph = graph.addNode(String(startEvent.id), async () => ({
      messages: [],
    }));
  }

  for (const task of tasks) {
    const taskConfig = parseBpmnTaskConfig(task, systemPrompt);
    graph = graph.addNode(
      taskConfig.id,
      createTaskNode(
        taskConfig,
        agent,
        systemPrompt,
        threadId,
        availableTools
      )
    );
  }

  for (const gateway of gateways) {
    graph = graph.addNode(String(gateway.id), async (_state: any) => ({
      messages: [],
    }));
  }

  for (const endEvent of endEvents) {
    graph = graph.addNode(String(endEvent.id), async (state: any) => ({
      finalResponse: getLastText(state.messages),
      messages: [],
    }));
  }

  if (startEvents.length) {
    for (const startEvent of startEvents) {
      graph = graph.addEdge("seed_input", String(startEvent.id));
    }
  } else {
    const incomingTargets = new Set(
      flows.map((flow: any) => String(flow.targetRef))
    );
    const entryTargets = tasks
      .map((task: any) => String(task.id))
      .filter((taskId: string) => {
        return !incomingTargets.has(taskId);
      });

    for (const targetId of entryTargets) {
      graph = graph.addEdge("seed_input", targetId);
    }
  }

  for (const gateway of gateways) {
    graph = graph.addConditionalEdges(
      String(gateway.id),
      buildGatewayRoute(String(gateway.id), flows)
    );
  }

  for (const flow of flows) {
    graph = graph.addEdge(String(flow.sourceRef), String(flow.targetRef));
  }

  for (const endEvent of endEvents) {
    graph = graph.addEdge(String(endEvent.id), END);
  }

  return graph.compile();
}
