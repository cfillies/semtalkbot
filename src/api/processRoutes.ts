import { Express, Request, Response } from "express";
import {
  getProcessDetails,
  getProcessHistory,
  listRunningProcesses,
  startProcess,
  stepProcess,
  stopProcess,
  visualizeProcess,
} from "../process/processManager";

export function registerProcessRoutes(app: Express) {
  app.get("/processes-ui", (_req: Request, res: Response) => {
    res.type("html").send(buildProcessUiHtml());
  });

  app.get("/api/processes", (_req: Request, res: Response) => {
    res.json({
      processes: listRunningProcesses(),
    });
  });

  app.get("/api/processes/:id", async (req: Request, res: Response) => {
    try {
      const result = await getProcessDetails(String(req.params.id));
      if (!result) {
        res.status(404).json({ error: "Process not found" });
        return;
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? String(err),
      });
    }
  });

  app.get("/api/processes/:id/state", async (req: Request, res: Response) => {
    try {
      const result = await getProcessDetails(String(req.params.id));
      if (!result) {
        res.status(404).json({ error: "Process not found" });
        return;
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? String(err),
      });
    }
  });

  app.get("/api/processes/:id/history", async (req: Request, res: Response) => {
    try {
      const result = await getProcessHistory(String(req.params.id));
      if (!result) {
        res.status(404).json({ error: "Process not found" });
        return;
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? String(err),
      });
    }
  });

  app.get("/api/processes/:id/visualize", async (req: Request, res: Response) => {
    try {
      const result = await visualizeProcess(String(req.params.id));
      if (!result) {
        res.status(404).json({ error: "Process not found" });
        return;
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? String(err),
      });
    }
  });

  app.post("/api/processes/start", async (req: Request, res: Response) => {
    try {
      const result = await startProcess(req.body ?? {});
      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? String(err),
      });
    }
  });

  app.post("/api/processes/:id/step", async (req: Request, res: Response) => {
    try {
      const processId = String(req.params.id);
      const result = await stepProcess(processId, req.body ?? {});
      if (!result) {
        res.status(404).json({ error: "Process not found" });
        return;
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? String(err),
      });
    }
  });

  app.post("/api/processes/:id/stop", (req: Request, res: Response) => {
    const result = stopProcess(String(req.params.id));

    if (!result) {
      res.status(404).json({ error: "Process not found" });
      return;
    }

    res.json(result);
  });
}

function buildProcessUiHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Process Control Room</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --panel-2: #eef2ff;
      --text: #102033;
      --muted: #5f6b7a;
      --accent: #2563eb;
      --accent-2: #0f766e;
      --danger: #b91c1c;
      --border: #d8e0ea;
      --shadow: 0 20px 45px rgba(16, 32, 51, 0.08);
      --radius: 18px;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.10), transparent 30%),
        radial-gradient(circle at top right, rgba(15, 118, 110, 0.10), transparent 28%),
        var(--bg);
      color: var(--text);
    }

    header {
      padding: 28px 24px 8px;
      max-width: 1600px;
      margin: 0 auto;
    }

    h1 {
      margin: 0;
      font-size: clamp(28px, 4vw, 44px);
      letter-spacing: -0.03em;
    }

    .sub {
      margin-top: 8px;
      color: var(--muted);
      max-width: 72ch;
    }

    .layout {
      max-width: 1600px;
      margin: 0 auto;
      padding: 16px 24px 28px;
      display: grid;
      grid-template-columns: 340px minmax(0, 1fr);
      gap: 18px;
    }

    .panel {
      background: rgba(255,255,255,0.9);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .panel h2 {
      margin: 0;
      padding: 16px 18px;
      background: linear-gradient(135deg, var(--panel), var(--panel-2));
      border-bottom: 1px solid var(--border);
      font-size: 16px;
    }

    .stack {
      display: grid;
      gap: 12px;
      padding: 16px 18px 18px;
    }

    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      color: var(--muted);
    }

    input, textarea, select, button {
      font: inherit;
    }

    input, textarea, select {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #fff;
      padding: 10px 12px;
      color: var(--text);
    }

    textarea {
      min-height: 110px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    button {
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      color: white;
      background: var(--accent);
      cursor: pointer;
      box-shadow: 0 10px 18px rgba(37, 99, 235, 0.16);
    }

    button.secondary { background: var(--accent-2); }
    button.danger { background: var(--danger); }

    .mini {
      padding: 8px 10px;
      font-size: 13px;
    }

    .list {
      display: grid;
      gap: 10px;
    }

    .process-item {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px;
      background: #fff;
      cursor: pointer;
    }

    .process-item.active {
      border-color: var(--accent);
      background: #eff6ff;
    }

    .process-title {
      font-weight: 700;
      margin-bottom: 4px;
    }

    .process-meta {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.5;
    }

    .main {
      display: grid;
      gap: 18px;
      min-width: 0;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(560px, 1.45fr);
      gap: 18px;
      min-width: 0;
    }

    .diagram {
      min-height: 760px;
      overflow: auto;
      padding: 22px;
    }

    .diagram svg {
      max-width: 100%;
      height: auto;
      min-width: 100%;
    }

    .state-wrap {
      padding: 14px 18px 18px;
      display: grid;
      gap: 14px;
    }

    .state-summary {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .kv-table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
    }

    .kv-table th,
    .kv-table td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
      font-size: 13px;
    }

    .kv-table th {
      width: 32%;
      background: #f8fbff;
      color: #334155;
      font-weight: 700;
      white-space: nowrap;
    }

    .kv-empty {
      color: var(--muted);
      font-size: 13px;
      padding: 10px 2px 2px;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 4px 10px;
      background: #e0f2fe;
      color: #075985;
      font-size: 12px;
      font-weight: 700;
    }

    .status {
      color: var(--muted);
      font-size: 13px;
      margin-left: auto;
    }

    .header-line {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    @media (max-width: 1080px) {
      .layout, .grid {
        grid-template-columns: 1fr;
      }

      .diagram {
        min-height: 620px;
      }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
</head>
<body>
  <header>
    <h1>Process Control Room</h1>
    <div class="sub">Start a new process, step through it, inspect state and history, and visualize the current execution path.</div>
  </header>
  <div class="layout">
    <section class="panel">
      <h2>Sessions</h2>
      <div class="stack">
        <div class="row">
          <button class="mini" id="refreshBtn">Refresh</button>
        </div>
        <div class="list" id="processList"></div>
      </div>
    </section>

    <section class="main">
      <div class="grid">
        <section class="panel">
          <h2>Control</h2>
          <div class="stack">
            <label>Selected process
              <input id="processId" placeholder="select a running process or paste an id" />
            </label>
            <div class="row">
              <button id="loadBtn">Load</button>
              <button class="secondary" id="stepBtn">Step</button>
              <button class="danger" id="stopBtn">Stop</button>
            </div>
            <label>New process name
              <input id="newName" placeholder="json-process" />
            </label>
            <label>Initial user query
              <input id="newQuery" placeholder="optional" />
            </label>
            <label>Initial env JSON
              <textarea id="newEnv" placeholder='{"Request":"Billing"}'></textarea>
            </label>
            <div class="row">
              <button class="secondary" id="startBtn">Start Process</button>
            </div>
            <div class="chip" id="statusChip">idle</div>
            <div class="status" id="selectedStatus"></div>
          </div>
        </section>

        <section class="panel">
          <h2>Visualization</h2>
          <div class="diagram" id="diagram">Select a process to render the graph.</div>
        </section>
      </div>

      <section class="panel">
        <h2>State & History</h2>
        <div class="state-wrap" id="details">
          <div class="state-summary">No process loaded.</div>
        </div>
      </section>
    </section>
  </div>

  <script>
    mermaid.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'loose' });

    const els = {
      processList: document.getElementById('processList'),
      processId: document.getElementById('processId'),
      newName: document.getElementById('newName'),
      newQuery: document.getElementById('newQuery'),
      newEnv: document.getElementById('newEnv'),
      details: document.getElementById('details'),
      diagram: document.getElementById('diagram'),
      statusChip: document.getElementById('statusChip'),
      selectedStatus: document.getElementById('selectedStatus'),
      refreshBtn: document.getElementById('refreshBtn'),
      loadBtn: document.getElementById('loadBtn'),
      stepBtn: document.getElementById('stepBtn'),
      stopBtn: document.getElementById('stopBtn'),
      startBtn: document.getElementById('startBtn'),
    };

    let currentProcess = null;

    els.refreshBtn.onclick = refreshProcesses;
    els.loadBtn.onclick = () => loadProcess(els.processId.value.trim());
    els.stepBtn.onclick = stepProcess;
    els.stopBtn.onclick = stopProcess;
    els.startBtn.onclick = startProcess;

    refreshProcesses();

    async function refreshProcesses() {
      setStatus('loading sessions...');
      const res = await fetch('/api/processes');
      const data = await res.json();
      renderProcessList(data.processes || []);
      setStatus('sessions loaded');
    }

    function renderProcessList(processes) {
      els.processList.innerHTML = '';
      if (!processes.length) {
        els.processList.innerHTML = '<div class="process-meta">No running processes.</div>';
        return;
      }

      for (const proc of processes) {
        const div = document.createElement('div');
        div.className = 'process-item' + (currentProcess && currentProcess.id === proc.id ? ' active' : '');
        div.innerHTML = '<div class="process-title">' + escapeHtml(proc.name || proc.id) + '</div>' +
          '<div class="process-meta">' +
          'ID: ' + escapeHtml(proc.id) + '<br/>' +
          'Status: ' + escapeHtml(proc.status || 'unknown') + '<br/>' +
          'Pause: ' + escapeHtml(formatPauseReason(proc.pauseReason)) + '<br/>' +
          'Current: ' + escapeHtml(proc.currentNode || '(none)') + '<br/>' +
          'Next: ' + escapeHtml((proc.next || []).join(', ') || '(none)') +
          '</div>';
        div.onclick = () => {
          els.processId.value = proc.id;
          loadProcess(proc.id);
        };
        els.processList.appendChild(div);
      }
    }

    async function loadProcess(id) {
      if (!id) return;
      setStatus('loading process...');
      const [detailsRes, vizRes, historyRes] = await Promise.all([
        fetch('/api/processes/' + encodeURIComponent(id)),
        fetch('/api/processes/' + encodeURIComponent(id) + '/visualize'),
        fetch('/api/processes/' + encodeURIComponent(id) + '/history'),
      ]);

      if (!detailsRes.ok) {
        const err = await detailsRes.json();
        throw new Error(err.error || 'Failed to load process');
      }

      const details = await detailsRes.json();
      const viz = await vizRes.json();
      const history = await historyRes.json();
      currentProcess = details.session;
      els.processId.value = id;
      renderDetails(details, history);
      els.selectedStatus.textContent = details.session
        ? ('State: ' + details.session.status + ' | Pause: ' + formatPauseReason(details.session.pauseReason) + ' | Current: ' + (details.session.currentNode || '(none)'))
        : '';
      await renderDiagram(viz.mermaid);
      setStatus('loaded ' + id);
      refreshProcesses();
    }

    async function stepProcess() {
      if (!els.processId.value.trim()) return;
      setStatus('stepping...');
      const payload = parseJsonMaybe(els.newEnv.value) || {};
      const res = await fetch('/api/processes/' + encodeURIComponent(els.processId.value.trim()) + '/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      renderDetails(data, null);
      if (data.session) {
        currentProcess = data.session;
      }
      if (data.session && data.session.id) {
        await loadProcess(data.session.id);
      } else {
        await loadProcess(els.processId.value.trim());
      }
      setStatus('stepped');
    }

    async function stopProcess() {
      if (!els.processId.value.trim()) return;
      setStatus('stopping...');
      const res = await fetch('/api/processes/' + encodeURIComponent(els.processId.value.trim()) + '/stop', {
        method: 'POST',
      });
      const data = await res.json();
      renderDetails(data, null);
      currentProcess = null;
      els.processId.value = '';
      els.diagram.textContent = 'Process stopped.';
      els.selectedStatus.textContent = '';
      setStatus('stopped');
      refreshProcesses();
    }

    async function startProcess() {
      setStatus('starting...');
      const payload = {
        name: els.newName.value.trim() || undefined,
        userQuery: els.newQuery.value.trim() || undefined,
        env: parseJsonMaybe(els.newEnv.value) || {},
        debugStepper: true,
      };
      const res = await fetch('/api/processes/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      renderDetails(data, null);
      if (data.session && data.session.id) {
        currentProcess = data.session;
        els.processId.value = data.session.id;
        await loadProcess(data.session.id);
      }
      setStatus('started');
      refreshProcesses();
    }

    async function renderDiagram(mermaidCode) {
      if (!mermaidCode) {
        els.diagram.textContent = 'No diagram available.';
        return;
      }
      try {
        const id = 'mermaid-' + Date.now();
        const { svg } = await mermaid.render(id, mermaidCode);
        els.diagram.innerHTML = svg;
      } catch (err) {
        els.diagram.textContent = mermaidCode;
      }
    }

    function parseJsonMaybe(text) {
      const trimmed = (text || '').trim();
      if (!trimmed) return null;
      try { return JSON.parse(trimmed); } catch { return null; }
    }

    function setStatus(text) {
      els.statusChip.textContent = text;
    }

    function formatPauseReason(pauseReason) {
      if (!pauseReason || !pauseReason.type) {
        return 'none';
      }

      return pauseReason.label || pauseReason.type;
    }

    function renderDetails(details, history) {
      const state = details?.state || details?.session || {};
      const env = state?.env || details?.session?.env || {};
      const entries = Object.entries(env || {});
      const pauseReason = formatPauseReason(state?.pauseReason || details?.session?.pauseReason);
      const summaryBits = [
        'Process: ' + escapeHtml(details?.session?.name || details?.session?.id || 'unknown'),
        'Status: ' + escapeHtml(details?.session?.status || 'unknown'),
        'Current: ' + escapeHtml(details?.session?.currentNode || state?.currentNode || '(none)'),
        'Pause: ' + escapeHtml(pauseReason),
      ];

      const html = [];
      html.push('<div class="state-summary">' + summaryBits.join(' | ') + '</div>');
      html.push('<table class="kv-table">');
      html.push('<thead><tr><th>Variable</th><th>Value</th></tr></thead><tbody>');

      if (!entries.length) {
        html.push('<tr><td colspan="2" class="kv-empty">No variables available.</td></tr>');
      } else {
        for (const [key, value] of entries) {
          html.push('<tr><th>' + escapeHtml(key) + '</th><td>' + escapeHtml(formatValue(value)) + '</td></tr>');
        }
      }

      html.push('</tbody></table>');

      if (history?.history?.length) {
        html.push('<div class="state-summary">History steps: ' + escapeHtml(String(history.history.length)) + '</div>');
      }

      els.details.innerHTML = html.join('');
    }

    function formatValue(value) {
      if (value === null || value === undefined) {
        return '';
      }

      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          return value.map(formatValue).filter(Boolean).join(', ');
        }

        return Object.values(value).map(formatValue).filter(Boolean).join(', ');
      }

      return String(value);
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`;
}
