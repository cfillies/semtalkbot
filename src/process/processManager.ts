import fs from "fs";
import { randomUUID } from "crypto";
import { Command } from "@langchain/langgraph";
import { createJSONStateGraph } from "../runtime/createJSONStateGraph";

export type ProcessStatus = "running" | "stopped" | "completed" | "failed";

export type ProcessSession = {
  id: string;
  name: string;
  graph: any;
  threadId: string;
  status: ProcessStatus;
  createdAt: string;
  updatedAt: string;
  debugStepper: boolean;
  definition: string;
};

export type ProcessStartRequest = {
  name?: string;
  definition?: string;
  debugStepper?: boolean;
  userQuery?: string;
  env?: Record<string, any>;
};

export type ProcessStepRequest = {
  resume?: any;
  env?: Record<string, any>;
};

const sessions = new Map<string, ProcessSession>();

export function listRunningProcesses() {
  return Array.from(sessions.values()).map((session) => summarizeSession(session));
}

export function getProcessSession(id: string) {
  return sessions.get(id) ?? null;
}

export function stopProcess(id: string) {
  const session = sessions.get(id);
  if (!session) {
    return null;
  }

  session.status = "stopped";
  session.updatedAt = new Date().toISOString();
  sessions.delete(id);
  return summarizeSession(session);
}

export async function getProcessDetails(id: string) {
  const session = sessions.get(id);
  if (!session) {
    return null;
  }

  const state = await session.graph.getState({
    configurable: {
      thread_id: session.threadId,
    },
  });

  return {
    session: summarizeSession(session, state),
    state: summarizeState(state, session.debugStepper),
    graph: buildGraphView(session.definition, state),
  };
}

export async function getProcessHistory(id: string) {
  const session = sessions.get(id);
  if (!session) {
    return null;
  }

  const config = {
    configurable: {
      thread_id: session.threadId,
    },
  };

  const history: Array<any> = [];
  let index = 0;

  for await (const snapshot of session.graph.getStateHistory(config)) {
    history.push({
      index,
      currentNode: getCurrentNode(snapshot),
      next: Array.isArray(snapshot?.next) ? snapshot.next : [],
      env: getCurrentEnv(snapshot),
      metadata: snapshot?.metadata ?? null,
      interrupts: getInterrupts(snapshot),
      pauseReason: getPauseReason(snapshot, session.debugStepper),
    });
    index += 1;
  }

  return {
    session: summarizeSession(session),
    history,
  };
}

export async function visualizeProcess(id: string) {
  const session = sessions.get(id);
  if (!session) {
    return null;
  }

  const state = await session.graph.getState({
    configurable: {
      thread_id: session.threadId,
    },
  });
  const history = await getProcessHistory(id);

  return {
    session: summarizeSession(session, state),
    graph: buildGraphView(session.definition, state, history),
    mermaid: buildGraphView(session.definition, state, history).mermaid,
  };
}

export async function startProcess(request: ProcessStartRequest) {
  const definition = request.definition ?? fs.readFileSync("langgraph.json", "utf-8");
  const sessionId = randomUUID();
  const debugStepper = request.debugStepper ?? true;
  const graph = createJSONStateGraph(
    definition,
    null,
    "",
    sessionId,
    { debugStepper }
  );

  const session: ProcessSession = {
    id: sessionId,
    name: request.name ?? "json-process",
    graph,
    threadId: sessionId,
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    debugStepper,
    definition,
  };

  sessions.set(sessionId, session);

  const result = await graph.invoke(
    {
      userQuery: request.userQuery ?? "",
      processVariables: request.env ?? {},
    },
    {
      configurable: {
        thread_id: session.threadId,
      },
    }
  );

  session.updatedAt = new Date().toISOString();

  const state = await graph.getState({
    configurable: {
      thread_id: session.threadId,
    },
  });

  if (isTerminalState(state)) {
    session.status = "completed";
    sessions.delete(sessionId);
  }

  return {
    session: summarizeSession(session, state),
    result,
  };
}

export async function stepProcess(id: string, request: ProcessStepRequest) {
  const session = sessions.get(id);
  if (!session) {
    return null;
  }

  const config = {
    configurable: {
      thread_id: session.threadId,
    },
  };

  const stateBefore = await session.graph.getState(config);
  const currentEnv = getCurrentEnv(stateBefore);
  const resumeValue =
    request.resume !== undefined
      ? request.resume
      : Object.keys(request.env ?? {}).length
        ? {
            ...currentEnv,
            ...request.env,
          }
        : currentEnv;

  const command =
    request.env && Object.keys(request.env).length > 0
      ? new Command({
          resume: resumeValue,
          update: {
            processVariables: {
              ...currentEnv,
              ...request.env,
            },
          },
        })
      : new Command({ resume: resumeValue });

  const result = await session.graph.invoke(command, config);
  session.updatedAt = new Date().toISOString();

  const stateAfter = await session.graph.getState(config);
  if (isTerminalState(stateAfter)) {
    session.status = "completed";
    sessions.delete(id);
  }

  return {
    session: summarizeSession(session, stateAfter),
    stateBefore: summarizeState(stateBefore),
    result,
  };
}

function summarizeSession(session: ProcessSession, state?: any) {
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    debugStepper: session.debugStepper,
    currentNode: getCurrentNode(state),
    next: Array.isArray(state?.next) ? state.next : [],
    env: getCurrentEnv(state),
    pauseReason: getPauseReason(state, session.debugStepper),
  };
}

function summarizeState(state: any, debugStepper = false) {
  return {
    currentNode: getCurrentNode(state),
    next: Array.isArray(state?.next) ? state.next : [],
    env: getCurrentEnv(state),
    metadata: state?.metadata ?? null,
    interrupts: getInterrupts(state),
    pauseReason: getPauseReason(state, debugStepper),
  };
}

function getCurrentEnv(state: any) {
  return state?.values?.processVariables ?? {};
}

function getCurrentNode(state: any) {
  return state?.tasks?.[0]?.name ?? null;
}

function getInterrupts(state: any) {
  const task = state?.tasks?.find(
    (candidate: any) => Array.isArray(candidate?.interrupts) && candidate.interrupts.length > 0
  );

  return task?.interrupts ?? [];
}

function getPauseReason(state: any, debugStepper: boolean) {
  if (getInterrupts(state).length > 0) {
    return {
      type: "userTask",
      label: "User task waiting for input",
    };
  }

  if (debugStepper && Array.isArray(state?.next) && state.next.length > 0) {
    return {
      type: "debugBreakpoint",
      label: "Paused by debug stepper",
    };
  }

  return {
    type: null,
    label: null,
  };
}

function isTerminalState(state: any) {
  return Array.isArray(state?.next) && state.next.length === 0 && (!state?.tasks || state.tasks.length === 0);
}

function buildModelSummary(definition: string, state: any) {
  try {
    const parsed = JSON.parse(definition);
    const process = parsed?.bpmn?.processes?.[0];
    const elements = Array.isArray(process?.elements) ? process.elements : [];
    const flows = Array.isArray(process?.flows) ? process.flows : [];

    return {
      processId: process?.id ?? null,
      processName: process?.name ?? null,
      currentNode: getCurrentNode(state),
      elements: elements.map((element: any) => ({
        id: String(element.id),
        name: String(element.name ?? element.id),
        type: String(element.type ?? "unknown"),
      })),
      flows: flows.map((flow: any) => ({
        id: String(flow.id),
        sourceRef: String(flow.sourceRef),
        targetRef: String(flow.targetRef),
        name: flow.name ?? null,
        condition: flow.condition ?? null,
        isDefault: Boolean(flow.isDefault),
      })),
    };
  } catch {
    return {
      processId: null,
      processName: null,
      currentNode: getCurrentNode(state),
      elements: [],
      flows: [],
    };
  }
}

function buildGraphView(definition: string, state: any, historyBundle?: any) {
  const model = buildModelSummary(definition, state);
  const history = normalizeHistory(historyBundle?.history ?? []);
  const currentNode = getCurrentNode(state);
  const visitedNodes = new Set<string>(
    history.flatMap((entry: any) => (entry.currentNode ? [entry.currentNode] : []))
  );
  if (currentNode) {
    visitedNodes.add(currentNode);
  }

  const pathEdges = collectPathEdges(history, currentNode);
  const pathEdgeKeys = new Set(pathEdges.map((edge) => `${edge.sourceRef}->${edge.targetRef}`));

  return {
    model,
    currentNode,
    visitedNodes: Array.from(visitedNodes),
    pathEdges,
    nodes: model.elements.map((element: any) => ({
      ...element,
      visited: visitedNodes.has(element.id),
      current: element.id === currentNode,
    })),
    edges: model.flows.map((flow: any) => ({
      ...flow,
      visited: pathEdgeKeys.has(`${flow.sourceRef}->${flow.targetRef}`),
    })),
    mermaid: buildMermaidDiagramFromView({
      model,
      currentNode,
      visitedNodes,
      pathEdgeKeys,
    }),
  };
}

function escapeMermaidLabel(value: string) {
  return String(value)
    .replace(/"/g, '\\"')
    .replace(/\n/g, "<br/>");
}

function buildMermaidDiagramFromView(view: {
  model: ReturnType<typeof buildModelSummary>;
  currentNode: string | null;
  visitedNodes: Set<string>;
  pathEdgeKeys: Set<string>;
}) {
  const safeIds = new Map<string, string>();
  view.model.elements.forEach((element: any, index: number) => {
    safeIds.set(element.id, `n${index}`);
  });

  const lines: string[] = ["flowchart LR"];

  for (const element of view.model.elements) {
    const safeId = safeIds.get(element.id)!;
    const className = element.id === view.currentNode
      ? "current"
      : view.visitedNodes.has(element.id)
        ? "visited"
        : null;
    const label = escapeMermaidLabel(`${element.name}\n${element.type}`);
    lines.push(`  ${safeId}["${label}"]`);
    if (className) {
      lines.push(`  class ${safeId} ${className};`);
    }
  }

  for (const flow of view.model.flows) {
    const sourceSafe = safeIds.get(flow.sourceRef);
    const targetSafe = safeIds.get(flow.targetRef);

    if (!sourceSafe || !targetSafe) {
      continue;
    }

    const arrow = view.pathEdgeKeys.has(`${flow.sourceRef}->${flow.targetRef}`)
      ? "-->"
      : "-->";
    lines.push(`  ${sourceSafe} ${arrow} ${targetSafe}`);
  }

  lines.push("");
  lines.push("classDef current fill:#1f6feb,stroke:#0b3d91,color:#ffffff;");
  lines.push("classDef visited fill:#dbeafe,stroke:#60a5fa,color:#0f172a;");
  lines.push("classDef path fill:#dcfce7,stroke:#16a34a,color:#052e16;");

  return lines.join("\n");
}

function normalizeHistory(history: any[]) {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  const allNumericSteps = history.every(
    (entry) => typeof entry?.metadata?.step === "number"
  );

  if (allNumericSteps) {
    return [...history].sort((a, b) => a.metadata.step - b.metadata.step);
  }

  return [...history].reverse();
}

function collectPathEdges(history: any[], currentNode: string | null) {
  const ordered = normalizeHistory(history);
  const edges: Array<{ sourceRef: string; targetRef: string }> = [];
  let previousNode: string | null = null;

  for (const entry of ordered) {
    const node = entry?.currentNode ?? null;
    if (!node) {
      continue;
    }

    if (previousNode && previousNode !== node) {
      edges.push({ sourceRef: previousNode, targetRef: node });
    }

    previousNode = node;
  }

  if (previousNode && currentNode && previousNode !== currentNode) {
    edges.push({ sourceRef: previousNode, targetRef: currentNode });
  }

  return dedupeEdges(edges);
}

function dedupeEdges(edges: Array<{ sourceRef: string; targetRef: string }>) {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.sourceRef}->${edge.targetRef}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
