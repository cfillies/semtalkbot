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
import { IExpression, ParsedJsonTaskConfig, parseJsonTaskConfig, SemTalkAssignment, SemTalkOperator } from "./jsonTaskConfig";
import { interrupt } from "@langchain/langgraph";

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
function applyAssignmentExpression(proc: any, expression: IExpression[], updates: any) {

  const changedVariables = new Set<string>();

  for (let expr of expression) {
    let obj1 = expr.var;
    let obj2 = expr.val;
    let op = expr.op as SemTalkAssignment;
    // let value1: any = "";
    let value2: any = "";
    let valname = obj2;
    let attr2 = "";
    let pkt2 = valname.indexOf(".");
    if (pkt2 > -1) {
      attr2 = valname.substring(pkt2 + 1);
      valname = valname.substring(0, pkt2);
    }
    if (attr2) {
      let inst2 = proc[valname];
      value2 = inst2[attr2];
    } else {
      if (proc[valname] !== undefined) {
        value2 = proc[valname];
      } else {
        value2 = valname;
      }
    }

    if (value2 && typeof value2 !== 'boolean' && !isNaN(Number(value2))) value2 = Number(value2);
    if (value2 === 'true') value2 = true;
    if (value2 === 'false') value2 = false;
    if (value2 === 'null') value2 = null;
    if (value2 === 'undefined') value2 = undefined;
    if (value2 === '[]') value2 = [];
    if (valname.startsWith('[') && valname.endsWith(']') && valname.indexOf(';') > -1) {
      value2 = valname.substring(1, valname.length - 1).split(";");
    }
    if (valname.startsWith('{') && valname.endsWith('}')) {
      try {
        value2 = JSON.parse(valname);
      } catch (e) {
        console.error("Error parsing JSON:", e);
      }
    }

    if (valname.startsWith('"') && valname.endsWith('"')) {
      value2 = valname.substring(1, valname.length - 1);
    } else {
      if (valname.startsWith("'") && valname.endsWith("'")) {
        value2 = valname.substring(1, valname.length - 1);
      }
    }

    let varname = obj1;
    let attr1 = "";
    let pkt1 = varname.indexOf(".");
    if (pkt1 > -1) {
      attr1 = varname.substring(pkt1 + 1);
      varname = varname.substring(0, pkt1);
    }

    if (attr1) {
    } else {
      // es gibt kein Attribut, sondern nur eine Variable
      switch ((SemTalkAssignment as any)[op]) {
        case SemTalkAssignment.assignment: {
          proc[varname] = value2;
          changedVariables.add(varname);
          break;
        }
        case SemTalkAssignment.push: {
          try {
            let v = proc[varname];
            if (!Array.isArray(v)) {
              v = [];
            }
            v.push(value2);
            proc[varname] = v;
            changedVariables.add(varname);
          } catch (e) { }
          break;
        }
        case SemTalkAssignment.pop: {
          try {
            let value = proc[varname];
            if (Array.isArray(value)) {
              proc[value2] = value.pop();
              changedVariables.add(value2);
            }
          } catch (e) { }
          break;
        }
        case SemTalkAssignment.append: {
          try {
            let v = proc[varname];
            if (!Array.isArray(v)) {
              v = [];
            }
            if (Array.isArray(value2)) {
              v.append(...value2);
            } else {
              v.append(value2);
            }
            proc[varname] = v;
            changedVariables.add(varname);
          } catch (e) { }
          break;
        }
        case SemTalkAssignment.remove: {
          try {
            let v = proc[varname];
            if (Array.isArray(v) && v.indexOf(value2) > -1) {
              v.splice(v.indexOf(value2), 1);
            }
            proc[varname] = v;
            changedVariables.add(varname);
          } catch (e) { }
          break;
        }
        case SemTalkAssignment.debug: {
          try {
            let v = proc[varname];
            console.debug(varname + " = " + v);
          } catch (e) { }
          break;
        }
        case SemTalkAssignment.increment: {
          try {
            let v = proc[varname];
            proc[varname] = v + value2;
            changedVariables.add(varname);
          } catch (e) { }
          break;
        }
        case SemTalkAssignment.decrement: {
          try {
            let v = proc[varname];
            proc[varname] = v - value2;
            changedVariables.add(varname);
          } catch (e) { }
          break;
        }
        case SemTalkAssignment.random: {
          // Random number between 0 and value2
          if (typeof value2 === 'number') {
            proc[varname] = Math.floor(Math.random() * value2);
            changedVariables.add(varname);
          }
          break;
        }
      }
    }
  }
  // create LangGraph update
  for (const name of changedVariables) {
    updates[name] = proc[name];
  }
  return updates;
}

export function testConditionExpression(proc: any, expression: IExpression[]): boolean {
  let res = true;
  for (let expr of expression) {
    let obj1 = expr["var"];
    let obj2 = expr["val"];
    let op = expr["op"];
    let value1: any = "";
    let value2: any = "";

    let varname = obj1;
    let attr1 = "";
    let pkt1 = varname.indexOf(".");
    if (pkt1 > -1) {
      attr1 = varname.substring(pkt1 + 1);
      varname = varname.substring(0, pkt1);
    }
    if (attr1) {
    } else {
      value1 = (proc as any)[varname];
    }
    let valname = obj2;
    let attr2 = "";
    let pkt2 = valname.indexOf(".");
    if (pkt2 > -1) {
      attr2 = valname.substring(pkt2 + 1);
      valname = valname.substring(0, pkt2);
    }
    if (attr2) {
      switch (valname) {
        default: {
          let inst2 = (proc as any)[valname];
          if (inst2) {
            if (attr2) {
              value2 = inst2.inst.GetValue(attr2);
            }
          }
        }
      }
    } else {
      if ((proc as any)[valname] !== undefined) {
        value2 = (proc as any)[valname];
      } else {
        value2 = valname;
      }
    }

    if (value1 && typeof value1 !== 'boolean' && !isNaN(Number(value1))) value1 = Number(value1);
    if (value2 && typeof value2 !== 'boolean' && !isNaN(Number(value2))) value2 = Number(value2);
    if (value1 === 'true') value1 = true;
    if (value1 === 'false') value1 = false;
    if (value2 === 'true') value2 = true;
    if (value2 === 'false') value2 = false;
    if (value1 === 'null') value1 = null;
    if (value2 === 'null') value2 = null;
    if (value1 === 'undefined') value1 = undefined;
    if (value2 === 'undefined') value2 = undefined;

    if (valname.startsWith('"') && valname.startsWith('"')) {
      value2 = valname.substring(1, valname.length - 1);
    } else {
      if (valname.startsWith("'") && valname.startsWith("'")) {
        value2 = valname.substring(1, valname.length - 1);
      }
    }

    let operator: SemTalkOperator = op as SemTalkOperator;
    // for (let ind in SemTalkOperator) {
    //   if (SemTalkOperator.)
    // }
    switch (operator) {
      case SemTalkOperator.contains: {
        try {
          res = value1.indexOf(value2) > -1;
        } catch (e) { }
        break;
      }
      case SemTalkOperator.eq: {
        res = (value1 === value2);
        break;
      }
      case SemTalkOperator.ne: {
        res = (value1 !== value2);
        break;
      }
      case SemTalkOperator.gt: {
        res = (value1 > value2);
        break;
      }
      case SemTalkOperator.lt: {
        res = (value1 < value2);
        break;
      }
      case SemTalkOperator.ge: {
        res = (value1 >= value2);
        break;
      }
      case SemTalkOperator.le: {
        res = (value1 <= value2);
        break;
      }
      // case SemTalkOperator.is: {
      //   try {
      //     let cls = obj.ObjectBase.FindBusinessClass("Ob#" + value2);
      //     if (cls && obj.ObjectBase.IsInstance(value1)) {
      //       res = (value1 as ISemTalkInstance).IsInstance(cls);
      //     }
      //   } catch (e) { }
      //   break;
      // }
      // case SemTalkOperator.isnot: {
      //   try {
      //     let cls = obj.ObjectBase.FindBusinessClass("Ob#" + value2);
      //     if (cls && obj.ObjectBase.IsInstance(value1)) {
      //       res = !(value1 as ISemTalkInstance).IsInstance(cls);
      //     }
      //   } catch (e) { }
      //   break;
      // }
      case SemTalkOperator.in: {
        try {
          let list = value2.split(";");
          res = list.indexOf(value1) > -1;
        } catch (e) { }
        break;
      }
      case SemTalkOperator.ni: {
        try {
          let list = value2.split(";");
          res = list.indexOf(value1) < 0;
        } catch (e) { }
        break;
      }
      case SemTalkOperator.and: {
        try {
          res = value1 && value2;
        } catch (e) { }
        break;
      }
      case SemTalkOperator.or: {
        try {
          res = value1 || value2;
        } catch (e) { }
        break;
      }
      case SemTalkOperator.not: {
        try {
          res = value1 === !value2;
        } catch (e) { }
        break;
      }
    }
    console.debug(obj1, op, value2, res);
    if (!res) {
      return false;
    }
  }
  return res;
}


function userTaskNode(state: any) {
  return interrupt({
    type: "adaptiveCard",
    card: {
      $schema: "...",
      type: "AdaptiveCard",
      body: [
        {
          type: "Input.Text",
          id: "customerName",
          label: "Customer name"
        }
      ],
      actions: [
        {
          type: "Action.Submit",
          title: "Submit"
        }
      ]
    }
  });
}

async function expressionTaskNode(task: ParsedJsonTaskConfig) {
  return async (state: any) => {
    let variables = state.processVariables;
    // console.log(task.name, 'Global Variables:', variables); // Example usage - logging
    const updates: any = {};

    applyAssignmentExpression(variables, task.AssignmentExpression, updates);
    return {
      processVariables: updates
    };
  };
}

async function serviceTaskNode(state:any) {

  const response = await fetch(
    "https://api/customer"
  );

  const customer = await response.json();

  return {
    processVariables:{
      customer
    }
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

    userTaskNode(state);
    
    // Accessing processVariables.global
    const historyMessages = Array.isArray(state.messages)
      ? state.messages
      : [];
    // if (!state.processVariables) {
    //   state.processVariables = {};
    // }
    state.processVariables["userQuery"] = state.userQuery || "";
    let variables = state.processVariables;
    if (!variables) {
      variables = {}
    }
    console.log(task.name, 'Global Variables:', variables); // Example usage - logging

    // Reading inputs from the task configuration
    const taskInputs = task.inputs || [];
    const taskOutputs = task.outputs || [];

    // Building a prompt that incorporates input values
    const inputValues = taskInputs.map(k => {
      return k + ":" + (variables[k as string] || "[undefined]");
    }).join("\n");

    let outputTemplate: any = {};

    for (let k of taskOutputs) {
      outputTemplate[k] = "value for " + k
    }

    // Construct user prompt, incorporating input values
    let userPrompt = `BPMN task: ${task.name}\nInputs:\n${inputValues}\n\nPrompt: ${task.promptTemplate}`;
    if (taskOutputs.length > 0) {
      userPrompt += "\n Please respond with the following output format:\n" + JSON.stringify(outputTemplate);
    }

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
          new HumanMessage(userPrompt)
        ],
        processVariables: variables,
      },
      {
        configurable: {
          thread_id: `${threadId}:${agentConfig.id}:${task.id}`,
        },
      }
    );


    // Assuming response has structured result
    // const structuredResult = response?.result || {}; // Adapt based on your actual response structure

    // Return messages for the response
    let structuredResult: any = {};
    const messages = response?.messages ?? [];
    const finalMessage = messages[messages.length - 1];
    if (finalMessage.content) {
      const trimmed = finalMessage.content.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        structuredResult = JSON.parse(finalMessage.content);
      }

    }

    const updates: any = {};

    // Write the structured result back to globalVariables for future tasks
    for (const k of taskOutputs) {
      if (structuredResult[k] !== undefined) {
        updates[k] = structuredResult[k]
      }
    }

    applyAssignmentExpression(variables, task.AssignmentExpression, updates);

    return {
      processVariables: updates,
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

  // const StateAnnotation = Annotation.Root({
  //   ...MessagesAnnotation.spec,
  //   userQuery: Annotation<string>(),
  //   finalResponse: Annotation<string>(),
  //   processVariables: Annotation<{
  //     global: Record<string, any>;
  //     local: Record<string, any>;
  //   }>(),
  // });

  const StateAnnotation = Annotation.Root({
    ...MessagesAnnotation.spec,
    userQuery: Annotation<string>(),
    finalResponse: Annotation<string>({
      value: (a, b) => b,
      default: () => ""
    }),
    processVariables: Annotation<Record<string, any>>({
      reducer: (x, y) => ({ ...x, ...y }),
      default: () => ({}),
    }),
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
        if (f.condition) {
          const expr: IExpression[] = JSON.parse(f.condition);
          const variables = state.processVariables;
          // TODO: handle datatypes "and"
          let test: boolean = testConditionExpression(variables, expr);
          if (test) {
            return f.targetRef;
          }
        }
      }
      // 2. Default flow
      const defaultFlow = outgoing.find(
        (f: any) => f.isDefault
      );

      if (defaultFlow) {
        return defaultFlow.targetRef;
      }


      // 3. Exactly one unconditional flow
      const unconditional = outgoing.filter(
        (f: any) => !f.condition
      );

      if (unconditional.length === 1) {
        return unconditional[0].targetRef;
      }

      throw new Error(
        `No valid outgoing flow from gateway ${gwId}`
      );
      // 4. Nothing selected
      // return END;

      // return outgoing[0]?.targetRef ?? END;
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
    const source = gateways.find(
      n => n.id === flow.sourceRef
    );

    if (source?.type === "exclusiveGateway") {
      continue;
    } graph = graph.addEdge(String(flow.sourceRef), String(flow.targetRef));
  }

  // for (const endEvent of endEvents) {
  //   graph = graph.addEdge(String(endEvent.id), END);
  // }

  return graph.compile();
}
