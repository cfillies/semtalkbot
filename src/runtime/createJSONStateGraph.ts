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
import { IExpression, ParsedJsonTaskConfig, parseJsonTaskConfig, SemTalkAssignment } from "./jsonTaskConfig";

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
function applyAssignmentExpression(proc: any, expression: IExpression[]) {
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
      // Es gibt immer einen varname 
      // switch (varname) {
      //   default: {
      //     let businesoobj = ob.FindBusinessClass("Ob#" + varname);
      //     if (businesoobj) {
      //       // varname ist eine Infoklasse => erste Instanz im Prozess
      //       let siminst1 = proc.FindInstance(ob, businesoobj);
      //       if (siminst1) {
      //         // if (attr1) {
      //         switch ((SemTalkAssignment as any)[op]) {
      //           case SemTalkAssignment.assignment: {
      //             // die SemTalk Instanz zur Simulationsinstanz
      //             let inst2 = (siminst1.inst as ISemTalkObject);
      //             let cls = obj.ObjectBase.FindBusinessClass("Ob#" + value2);
      //             if (cls) {
      //               // wenn value2 eine Klasse ist, dann die Instanz holen
      //               // der Fall, das es eine variable ist fehlt hier
      //               let inst = proc.GetInstance(obj.ObjectBase, cls);
      //               if (inst !== null) {
      //                 // wenn es eine Instanz ist, dann die Assoziation herstellen
      //                 // ansonsten den Wert setzen
      //                 let inst3 = (inst.inst as ISemTalkObject);
      //                 if (!inst2.HasDirectLink(attr1, inst3)) {
      //                   inst2.MakeAssociation(attr1, inst3);
      //                 }
      //               }
      //             } else {
      //               inst2.SetValue(attr1, value2);
      //             }
      //             break;
      //           }

      //           // Listenoperationen bei Instanzen beziehen sich auf listenwertige Attribute
      //           // bei listenwertigen variablen könnte man auch list von objekten machen
      //           // ober bei objekten schauen ob es attr1 eine Association ist
      //           case SemTalkAssignment.push: {
      //             try {
      //               let v = siminst1.inst.GetValue(attr1).split(";");
      //               v.push(value2);
      //               siminst1.inst.SetValue(attr1, v.join(";"));
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.pop: {
      //             try {
      //               let value = siminst1.inst.GetValue(attr1).split(";");
      //               if (Array.isArray(value)) {
      //                 proc[value2] = value.pop();
      //               }
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.append: {
      //             try {
      //               let v = siminst1.inst.GetValue(attr1).split(";");
      //               if (!Array.isArray(value2)) {
      //                 v.append(...value2);
      //               } else {
      //                 v.append(value2);
      //               }
      //               siminst1.inst.SetValue(attr1, v.join(";"));
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.remove: {
      //             try {
      //               let v = siminst1.inst.GetValue(attr1).split(";");
      //               if (Array.isArray(v) && v.indexOf(value2) > -1) {
      //                 v.splice(v.indexOf(value2), 1);
      //               }
      //               siminst1.inst.SetValue(attr1, v.join(";"));
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.alert: {
      //             try {
      //               let v = siminst1.inst;
      //               if (ob.IsInstance(v)) {
      //                 alert(obj.ObjectCaption + ": " + varname + " = " + (v as ISemTalkInstance).ObjectCaption);
      //               } else {
      //                 alert(obj.ObjectCaption + ": " + varname + " = " + v);
      //               }
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.debug: {
      //             try {
      //               let v = siminst1.inst;
      //               if (ob.IsInstance(v)) {
      //                 console.debug(obj.ObjectCaption + ": " + varname + " = " + (v as ISemTalkInstance).ObjectCaption);
      //               } else {
      //                 console.debug(obj.ObjectCaption + ": " + varname + " = " + v);
      //               }
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.increment: {
      //             try {
      //               let v = siminst1.inst.GetValue(attr1);
      //               siminst1.inst.SetValue(attr1, v + value2);
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.decrement: {
      //             try {
      //               let v = siminst1.inst.GetValue(attr1);
      //               siminst1.inst.SetValue(attr1, v - value2);
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.new: {
      //             try {
      //               let cls = obj.ObjectBase.FindBusinessClass("Ob#" + value2);
      //               let inst2 = (siminst1.inst as ISemTalkObject);
      //               if (cls) {
      //                 // wenn value2 eine Klasse ist, dann die Instanz holen
      //                 // der Fall, das es eine variable ist fehlt hier
      //                 let siminst = proc.GetInstance(obj.ObjectBase, cls);
      //                 if (siminst !== null) {
      //                   let inst3 = (siminst.inst as ISemTalkObject);
      //                   if (!inst2.HasDirectLink(attr1, inst3)) {
      //                     inst2.MakeAssociation(attr1, inst3);
      //                   }
      //                 }
      //               } else {
      //                 inst2.SetValue(attr1, value2);
      //               }
      //             } catch (e: any) {
      //               alert(e.message);
      //             }
      //             break;
      //           }
      //           case SemTalkAssignment.delete: {
      //             try {
      //               proc.DeleteInstance(siminst1);
      //               // delete proc[varname];
      //             } catch (e) { }
      //             break;
      //           }
      //         }
      //         // }
      //       }
      //     } else {
      //       // varname ist eine Variable und der Wert der Variablen ist ein Objekt
      //       if (proc[varname] !== undefined && attr1 !== "") {
      //         let siminst1: IInstance = proc[varname];
      //         switch ((SemTalkAssignment as any)[op]) {
      //           case SemTalkAssignment.assignment: {
      //             // die SemTalk Instanz zur Simulationsinstanz
      //             let inst2 = (siminst1.inst as ISemTalkObject);

      //             let cls = obj.ObjectBase.FindBusinessClass("Ob#" + value2);
      //             if (cls) {
      //               let siminst: IInstance | null = proc.GetInstance(obj.ObjectBase, cls);
      //               if (siminst !== null) {
      //                 let inst3 = (siminst.inst as ISemTalkObject);
      //                 if (!inst2.HasDirectLink(attr1, inst3)) {
      //                   inst2.MakeAssociation(attr1, inst3);
      //                 }
      //               }
      //             } else {
      //               inst2.SetValue(attr1, value2);
      //             }
      //             break;
      //           }
      //           case SemTalkAssignment.push: {
      //             try {
      //               let v = siminst1.inst.GetValue(attr1).split(";");
      //               v.push(value2);
      //               siminst1.inst.SetValue(attr1, v.join(";"));
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.pop: {
      //             try {
      //               let value = siminst1.inst.GetValue(attr1).split(";");
      //               if (Array.isArray(value)) {
      //                 proc[value2] = value.pop();
      //               }
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.append: {
      //             try {
      //               let v = siminst1.inst.GetValue(attr1).split(";");
      //               if (!Array.isArray(value2)) {
      //                 v.append(...value2);
      //               } else {
      //                 v.append(value2);
      //               }
      //               siminst1.inst.SetValue(attr1, v.join(";"));
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.alert: {
      //             try {
      //               let v = siminst1.inst;
      //               if (ob.IsInstance(v)) {
      //                 alert(obj.ObjectCaption + ": " + varname + " = " + (v as ISemTalkInstance).ObjectCaption);
      //               } else {
      //                 alert(obj.ObjectCaption + ": " + varname + " = " + v);
      //               }
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.debug: {
      //             try {
      //               let v = siminst1.inst;
      //               if (ob.IsInstance(v)) {
      //                 console.debug(obj.ObjectCaption + ": " + varname + " = " + (v as ISemTalkInstance).ObjectCaption);
      //               } else {
      //                 console.debug(obj.ObjectCaption + ": " + varname + " = " + v);
      //               }
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.remove: {
      //             try {
      //               let v = siminst1.inst.GetValue(attr1).split(";");
      //               if (Array.isArray(v) && v.indexOf(value2) > -1) {
      //                 v.splice(v.indexOf(value2), 1);
      //               }
      //               siminst1.inst.SetValue(attr1, v.join(";"));
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.increment: {
      //             try {
      //               let v = Number(siminst1.inst.GetValue(attr1));
      //               siminst1.inst.SetValue(attr1, v + value2);
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.decrement: {
      //             try {
      //               let v = Number(siminst1.inst.GetValue(attr1));
      //               siminst1.inst.SetValue(attr1, v - value2);
      //             } catch (e) { }
      //             break;
      //           }
      //           case SemTalkAssignment.new: {
      //             try {
      //               let cls = obj.ObjectBase.FindBusinessClass("Ob#" + value2);
      //               let inst2 = (siminst1.inst as ISemTalkObject);
      //               if (cls) {
      //                 let siminst = proc.GetInstance(obj.ObjectBase, cls);
      //                 if (siminst !== null) {
      //                   let inst3 = (siminst.inst as ISemTalkObject);
      //                   if (!inst2.HasDirectLink(attr1, inst3)) {
      //                     inst2.MakeAssociation(attr1, inst3);
      //                   }
      //                 }
      //               } else {
      //                 inst2.SetValue(attr1, value2);
      //               }
      //             } catch (e: any) {
      //               alert(e.message);
      //             }
      //             break;
      //           }
      //           case SemTalkAssignment.delete: {
      //             try {
      //               proc.DeleteInstance(siminst1);
      //               delete proc[varname];
      //             } catch (e) { }
      //             break;
      //           }
      //         }
      //       }
      //     }
      //   }
      // }
    } else {
      // es gibt kein Attribut, sondern nur eine Variable
      switch ((SemTalkAssignment as any)[op]) {
        case SemTalkAssignment.assignment: {
          // let cls = obj.ObjectBase.FindBusinessClass("Ob#" + value2);
          // if (cls) {
          //   let siminst: IInstance | null = proc.GetInstance(obj.ObjectBase, cls);
          //   if (siminst) {
          //     value2 = siminst;
          //   }
          // }
          proc[varname] = value2;
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
          } catch (e) { }
          break;
        }
        case SemTalkAssignment.pop: {
          try {
            let value = proc[varname];
            if (Array.isArray(value)) {
              proc[value2] = value.pop();
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
          } catch (e) { }
          break;
        }
        // case SemTalkAssignment.alert: {
        //   try {
        //     let v = proc[varname];
        //     if (ob.IsInstance(v)) {
        //       alert(obj.ObjectCaption + ": " + varname + " = " + (v as ISemTalkInstance).ObjectCaption);
        //     } else {
        //       alert(obj.ObjectCaption + ": " + varname + " = " + v);
        //     }
        //   } catch (e) { }
        //   break;
        // }
        case SemTalkAssignment.debug: {
          try {
            let v = proc[varname];
            // if (ob.IsInstance(v)) {
            //   console.debug(obj.ObjectCaption + ": " + varname + " = " + (v as ISemTalkInstance).ObjectCaption);
            // } else {
            //   console.debug(obj.ObjectCaption + ": " + varname + " = " + v);
            // }
              console.debug(varname + " = " + v);
          } catch (e) { }
          break;
        }
        case SemTalkAssignment.increment: {
          try {
            let v = proc[varname];
            proc[varname] = v + value2;
          } catch (e) { }
          break;
        }
        case SemTalkAssignment.decrement: {
          try {
            let v = proc[varname];
            proc[varname] = v - value2;
          } catch (e) { }
          break;
        }
        // case SemTalkAssignment.new: {
        //   try {
        //     let cls = obj.ObjectBase.FindBusinessClass("Ob#" + value2);
        //     if (cls) {
        //       proc[varname] = proc.GetInstance(obj.ObjectBase, cls);
        //     }
        //   } catch (e) { }
        //   break;
        // }
        // case SemTalkAssignment.delete: {
        //   try {
        //     let inst = proc[varname];
        //     if (inst) {
        //       proc.DeleteInstance(inst);
        //       delete proc[varname];
        //     }
        //   } catch (e) { }
        //   break;
        // }
        case SemTalkAssignment.random: {
          // Random number between 0 and value2
          if (typeof value2 === 'number') {
            proc[varname] = Math.floor(Math.random() * value2);
          }
          break;
        }
      }
    }
    // console.debug(obj1, op, value2);
  }
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
    // Accessing processVariables.global
    const historyMessages = Array.isArray(state.messages)
      ? state.messages
      : [];
    state.processVariables["userQuery"] = state.userQuery || "";
    let variables = state.processVariables;
    if (!variables) {
      variables = {}
    }
    console.log('Global Variables:', variables); // Example usage - logging

    // Reading inputs from the task configuration
    const taskInputs = task.inputs || [];
    const taskOutputs = task.outputs || [];

    // Building a prompt that incorporates input values
    const inputValues = taskInputs.map(k => {
      return k + ":" + (variables[k as string] || "[undefined]");
    }).join("\n");

    // const inputValues = Object.entries(taskInputs).map(([key, value]) => {
    //   return `${key}: ${state.processVariables?.global?.[value as string] || "[undefined]"}`;
    // }).join("\n");

    // Construct user prompt, incorporating input values
    const userPrompt = `BPMN task: ${task.name}\nInputs:\n${inputValues}\n\nPrompt: ${task.promptTemplate}`;

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
        variables: variables,
      },
      {
        configurable: {
          thread_id: `${threadId}:${agentConfig.id}:${task.id}`,
        },
      }
    );


    // Assuming response has structured result
    const structuredResult = response?.result || {}; // Adapt based on your actual response structure

    // Write the structured result back to globalVariables for future tasks
    for (const k of taskOutputs) {
      if (structuredResult[k] !== undefined) {
        variables[k] = structuredResult[k]
      }
    }
    // Object.entries(taskOutputs).forEach(([key, outputParam]) => {
    //   globalVariables[outputParam as string] = structuredResult[key];
    // });

    // Return messages for the response
    const messages = response?.messages ?? [];
    const finalMessage = messages[messages.length - 1];


    // Write the updated globalVariables back to the state
    // let processVariables = state.processVariables;
    // processVariables.global = variables; // This line updates the state

    applyAssignmentExpression(variables, task.AssignmentExpression);
 
    return {
      processVariables: variables,
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
