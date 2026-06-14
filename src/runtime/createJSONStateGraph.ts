import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getTools } from "../mcp/mcpToolsAdapter";
import { createBpmnAgent } from "../agents/createBpmnAgent";
import { ParsedJsonAgentConfig, parseJsonAgentConfig } from "./jsonAgentConfig";
import { asArray, getLastText, selectTools } from "./utils";
import { ParsedJsonTaskConfig, parseJsonTaskConfig } from "./jsonTaskConfig";

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

function buildAgentTopology(process: any, fallbackSystemPrompt: string) {
  const laneConfigs = new Map<string, ParsedJsonAgentConfig>();
  const taskToLaneId = new Map<string, string>();
  const lanes = asArray(process.lanes);

    for (const lane of lanes) {
      const laneConfig = parseJsonAgentConfig(lane, fallbackSystemPrompt);
      laneConfigs.set(laneConfig.id, laneConfig);

      for (const elementid of asArray(lane.elements)) {
        taskToLaneId.set(String(elementid), laneConfig.id);
      }
    }
  

  const participantConfigs = lanes.map((participant: any) =>
    parseJsonAgentConfig(participant, fallbackSystemPrompt)
  );

  if (participantConfigs.length > 1) {
    console.warn(
      `[BPMN] multiple participants found; using ${participantConfigs[0].name} as the default fallback agent`
    );
  }

  const defaultAgentConfig =
    participantConfigs[0] ?? parseJsonAgentConfig(process, fallbackSystemPrompt);

  return {
    laneConfigs,
    taskToLaneId,
    defaultAgentConfig,
  };
}

function createTaskNode(
  task: ParsedJsonTaskConfig,
  agentConfig: ParsedJsonAgentConfig,
  threadId: string,
  availableTools: any[],
  agentCache: Map<string, any>
) {
  const laneTools = selectTools(availableTools, agentConfig.toolNames);
  const effectiveTools = task.toolFilterDefined
    ? selectTools(laneTools, task.toolNames)
    : laneTools;
  const cacheKey = [
    agentConfig.id,
    agentConfig.model ?? "gpt-4o-mini",
    String(agentConfig.temperature ?? 0),
    effectiveTools.map((tool) => tool.name).join("|"),
  ].join("::");

  let agent = agentCache.get(cacheKey);
  if (!agent) {
    agent = createBpmnAgent(agentConfig, effectiveTools);
    agentCache.set(cacheKey, agent);
  }

  return async (state: any) => {
    const historyMessages = Array.isArray(state.messages)
      ? state.messages
      : [];

    const systemMessages = [
      new SystemMessage(agentConfig.systemPrompt),
    ];

    if (task.systemPromptDefined && task.systemPrompt.trim()) {
      systemMessages.push(new SystemMessage(task.systemPrompt));
    }

    const response = await agent.invoke(
      {
        messages: [
          ...systemMessages,
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
          thread_id: `${threadId}:${agentConfig.id}:${task.id}`,
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

export function createJSONStateGraph(
  json: string,
  _agent: any,
  systemPrompt: string,
  threadId: string
) {
  const langgraph: any = JSON.parse(json);
  if (langgraph!.bpmn!.processes.length === 0) {
    throw new Error("Invalid JSON graph: no processes found");
  }
  const process = langgraph!.bpmn.processes[0];

  // const lanes = asArray(process.lanes);
  const elements = asArray(process.elements);

  const tasks = elements.filter(x => x.type === "task");
  const gateways = elements.filter(x => x.type === "exclusiveGateway");
  const startEvents = elements.filter(x => x.type === "startEvent");
  const endEvents = elements.filter(x => x.type === "endEvent");
  const flows = asArray(process.flows);
  
  const availableTools = getTools();
  const { laneConfigs, taskToLaneId, defaultAgentConfig } = buildAgentTopology(
    process,
    systemPrompt
  );

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
  const agentCache = new Map<string, any>();

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
    const laneId = taskToLaneId.get(String(task.id));
    const laneConfig =
      (laneId ? laneConfigs.get(laneId) : undefined) ?? defaultAgentConfig;
    const taskConfig = parseJsonTaskConfig(task, systemPrompt, laneId);

    graph = graph.addNode(
      taskConfig.id,
      createTaskNode(
        taskConfig,
        laneConfig,
        threadId,
        availableTools,
        agentCache
      )
    );
  }

  for (const gateway of gateways) {
    const gwId = gateway.id;
    graph = graph.addNode(String(gateway.id), async () => ({
      messages: [],
    }));

    const routeFn = (state: any) => {
      const lastText = state.messages[state.messages.length - 1]?.content?.toLowerCase() || "";
      const outgoing = flows.filter((f: any) => f.sourceRef === gwId);

      for (const f of outgoing) {
        if (f.name && lastText.includes(f.name.toLowerCase())) return f.targetRef;
      }
      return outgoing[0]?.targetRef ?? END;
    };

    graph = graph.addConditionalEdges(gwId, routeFn);

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

  // for (const gateway of gateways) {
  //   graph = graph.addConditionalEdges(
  //     String(gateway.id),
  //     buildGatewayRoute(String(gateway.id), flows)
  //   );
  // }

  for (const flow of flows) {
    graph = graph.addEdge(String(flow.sourceRef), String(flow.targetRef));
  }

  // for (const endEvent of endEvents) {
  //   graph = graph.addEdge(String(endEvent.id), END);
  // }

  return graph.compile();
}
