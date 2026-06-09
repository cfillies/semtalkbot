import fs from "fs";
import { XMLParser } from "fast-xml-parser";
import {
  StateGraph,
  MessagesAnnotation,
  Annotation,
  START,
  END,
//  addConditionalEdges,
} from "@langchain/langgraph";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { startServer } from "@microsoft/agents-hosting-express";
import { AgentApplication } from "@microsoft/agents-hosting";


// -------- 1️⃣ Load BPMN XML --------
const xml = fs.readFileSync("demo.bpmn", "utf-8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
const bpmn = parser.parse(xml);

const process = bpmn.definitions.process;

// Tasks, gateways, flows
const tasks = Array.isArray(process.task) ? process.task : process.task ? [process.task] : [];
const gateways = Array.isArray(process.exclusiveGateway)
  ? process.exclusiveGateway
  : process.exclusiveGateway ? [process.exclusiveGateway] : [];
const flows = Array.isArray(process.sequenceFlow)
  ? process.sequenceFlow
  : process.sequenceFlow ? [process.sequenceFlow] : [];

// -------- 2️⃣ Initialize LLM --------
const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 });

const StateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,      // spread the messages channel
  processVariables: Annotation<{
    global: Record<string, any>;
    local: Record<string, any>;
  }>()
});
// -------- 3️⃣ Build LangGraph --------
let graph = new StateGraph(StateAnnotation);

// 3️⃣1 Add a system prompt node (first node)
let x = graph.addNode("task1", async (state) => ({
  messages: [new SystemMessage("System prompt: follow BPMN workflow"), ...(state.messages || [])],
}));

// Connect START → first node
x = x.addEdge(START, "task1");

// -------- 4️⃣ Add BPMN tasks as nodes --------
tasks.forEach((task: any) => {
  const id = task.id;
  const promptTemplate = task["ai:LLMTask"]?.promptTemplate ?? `Perform task: ${task.name}`;

  x = x.addNode(id, async (state) => {
    const last = state.messages[state.messages.length - 1];
    const response = await llm.invoke([...(last ? [last] : []), new HumanMessage(promptTemplate)]);
    return { messages: [response] };
  });
});

// -------- 5️⃣ Add gateways with conditional routing --------
gateways.forEach((gw: any) => {
  const gwId = gw.id;

  const routeFn = (state: any) => {
    const lastText = state.messages[state.messages.length - 1]?.content?.toLowerCase() || "";
    const outgoing = flows.filter((f: any) => f.sourceRef === gwId);

    for (const f of outgoing) {
      if (f.name && lastText.includes(f.name.toLowerCase())) return f.targetRef;
    }
    return outgoing[0]?.targetRef ?? END;
  };

  x = x.addConditionalEdges(gwId, routeFn);
});

// -------- 6️⃣ Add normal sequence flows --------
flows.forEach((f: any) => {
  // skip gateway sources (already handled)
  if (!gateways.some((g: any) => g.id === f.sourceRef)) {
    x = x.addEdge(f.sourceRef, f.targetRef);
  }
});

// -------- 7️⃣ Add end node --------
let y = graph.addNode("end_node", async () => ({ messages: [] }));
y = y.addEdge("end_node", END);

// -------- 8️⃣ Compile LangGraph --------
const agentGraph = graph.compile();

// -------- 9️⃣ Setup MAF Application --------
const mafApp = new AgentApplication();

mafApp.onMessage("*", async (context) => {
  const text = context.activity.text?.trim();
  if (!text) return;

  if (!context.activity.conversation) return;
  const threadId = `${context.activity.conversation.id}:${context.activity.from?.id}`;

  const result = await agentGraph.invoke(
    { messages: [new HumanMessage(text)] },
    { configurable: { thread_id: threadId } }
  );

  const aiMsg = result.messages.slice().reverse().find((m) => m instanceof AIMessage);
  const reply = typeof aiMsg?.content === "string" ? aiMsg.content : JSON.stringify(aiMsg?.content ?? "");

  await context.sendActivity(reply);
});

// -------- 🔟 Start Express server --------
startServer(mafApp);
console.log("✅ BPMN LangGraph agent running!");
