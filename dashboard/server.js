const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = parseInt(process.argv[2], 10) || 4000;
const CSV_PATH = path.join(__dirname, '..', 'output.csv');
const LOG_DIR = path.join(__dirname, '..', 'logs');
const TARGET_PATH = path.join(__dirname, '..', 'logs', 'target.flag');

function parseCSV() {
  if (!fs.existsSync(CSV_PATH)) return { headers: [], rows: [], raw: '' };
  const content = fs.readFileSync(CSV_PATH, 'utf-8').trim();
  if (!content) return { headers: [], rows: [], raw: '' };
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',');
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').replace(/"/g, '').trim(); });
    rows.push(row);
  }
  return { headers, rows, raw: content };
}

function getTotalTarget() {
  if (fs.existsSync(TARGET_PATH)) {
    const val = fs.readFileSync(TARGET_PATH, 'utf-8').trim();
    if (val === 'INF') return 999999;
    const n = parseInt(val, 10);
    if (!isNaN(n)) return n;
  }
  return 0;
}

function getLatestLog(lines = 50) {
  if (!fs.existsSync(LOG_DIR)) return 'No logs yet';
  const logs = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.log')).sort().reverse();
  if (logs.length === 0) return 'No logs yet';
  const content = fs.readFileSync(path.join(LOG_DIR, logs[0]), 'utf-8');
  return content.split('\n').slice(-lines).join('\n');
}

function apiData() {
  const { rows } = parseCSV();
  const total = getTotalTarget();
  const success = rows.filter(r => r.Status === 'SUCCESS').length;
  const failed = rows.filter(r => r.Status === 'FAILURE').length;
  const logTail = getLatestLog(50);
  let ongoing = [];
  try {
    const p = path.join(__dirname, '..', 'logs', 'ongoing.json');
    if (fs.existsSync(p)) ongoing = JSON.parse(fs.readFileSync(p, 'utf-8') || '[]');
  } catch {}
  return JSON.stringify({ total, success, failed, completed: rows.length, rows, logTail, ongoing });
}

function buildDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>DB-CHOCK · DASHBOARD</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #000000;
    --surface: #0a0a0a;
    --border: #1a1a1a;
    --border-light: #222;
    --text: #f0f0f0;
    --text-dim: #555;
    --text-muted: #444;
    --green: #22c55e;
    --green-bg: rgba(34,197,94,0.1);
    --red: #ef4444;
    --red-bg: rgba(239,68,68,0.1);
    --yellow: #eab308;
    --yellow-bg: rgba(234,179,8,0.1);
    --radius: 10px;
    --radius-sm: 6px;
  }
  html { font-size: 16px; }
  @keyframes splashFadeIn {
    0% { transform: scale(1.08); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes splashZoomIn {
    0% { transform: scale(1); }
    100% { transform: scale(1.4); }
  }
  @keyframes splashZoomOut {
    0% { transform: scale(1.4); }
    100% { transform: scale(1); }
  }
  @keyframes splashFadeOut {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }
  .splash {
    position: fixed; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
    background: #000;
    transition: background 0.8s ease;
  }
  .splash span {
    font-family: 'Inter', sans-serif;
    font-size: clamp(36px, 10vw, 100px);
    font-weight: 800;
    color: #fff;
    transition: color 0.8s ease;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: #333; }

  .header {
    position: sticky; top: 0; z-index: 100;
    border-bottom: 1px solid var(--border);
    padding: 12px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--green);
    animation: pulse-dot 2s ease-in-out infinite;
  }
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .brand h1 {
    font-size: 14px; font-weight: 700;
    letter-spacing: -0.2px; color: var(--text);
  }
  .brand span {
    font-size: 10px; color: var(--text-dim);
    font-weight: 500; padding: 2px 8px;
    border: 1px solid var(--border); border-radius: 4px;
    letter-spacing: 0.3px;
  }
  .header-actions { display: flex; gap: 8px; align-items: center; }
  .last-updated {
    font-size: 10px; color: var(--text-dim);
    font-family: 'JetBrains Mono', monospace;
    display: none;
  }
  @media (min-width: 600px) { .last-updated { display: block; } }
  .kill-btn {
    background: transparent; color: var(--red);
    border: 1px solid rgba(239,68,68,0.3);
    padding: 6px 16px; border-radius: var(--radius-sm);
    font-weight: 600; font-size: 11px; cursor: pointer;
    transition: all 0.2s; font-family: inherit;
    letter-spacing: 0.3px;
  }
  .kill-btn:hover {
    background: var(--red-bg);
    border-color: var(--red);
  }

  .container { max-width: 1280px; margin: 0 auto; padding: 16px; }
  @media (min-width: 640px) { .container { padding: 20px 24px; } }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }
  @media (min-width: 480px) { .stats-row { grid-template-columns: repeat(5, 1fr); } }
  @media (min-width: 768px) { .stats-row { gap: 10px; } }
  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    transition: border-color 0.2s;
  }
  .stat:hover { border-color: var(--border-light); }
  .stat-label {
    font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.6px; color: var(--text-dim);
    font-weight: 600; margin-bottom: 4px;
  }
  .stat-val {
    font-size: 22px; font-weight: 700;
    letter-spacing: -0.4px; color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  @media (min-width: 768px) { .stat-val { font-size: 26px; } }
  .stat-val.green { color: var(--green); }
  .stat-val.red { color: var(--red); }
  .stat-val.dim { color: var(--text-dim); }

  .progress-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    margin-bottom: 16px;
  }
  .progress-header {
    display: flex; justify-content: space-between;
    align-items: center; margin-bottom: 8px;
  }
  .progress-title {
    font-size: 10px; font-weight: 600;
    color: var(--text-dim); text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .progress-pct {
    font-size: 12px; font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .progress-bar-bg {
    width: 100%; height: 5px;
    background: #111;
    border-radius: 3px; overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--green), #4ade80);
    border-radius: 3px; width: 0%;
    transition: width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    margin-bottom: 16px;
  }
  @media (min-width: 1000px) { .grid-2 { grid-template-columns: 1fr 1fr; } }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    display: flex;
    flex-direction: column;
  }
  .card-header {
    display: flex; justify-content: space-between;
    align-items: center; margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }
  .card-header h3 {
    font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.6px; color: var(--text-dim);
    font-weight: 600;
  }
  .card-header .count-badge {
    font-size: 10px; color: var(--text-dim);
    font-family: 'JetBrains Mono', monospace;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .search-input {
    width: 100%;
    background: #000;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    font-size: 12px; font-family: inherit;
    color: var(--text); outline: none;
    margin-bottom: 10px;
    transition: border-color 0.2s;
  }
  .search-input:focus { border-color: #333; }
  .search-input::placeholder { color: var(--text-muted); }

  .filter-row {
    display: flex; gap: 4px;
    margin-bottom: 10px; flex-wrap: wrap;
  }
  .filter-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    font-weight: 500; font-size: 10px;
    cursor: pointer; transition: all 0.15s;
    font-family: inherit; letter-spacing: 0.2px;
  }
  .filter-btn:hover { border-color: #333; color: var(--text); }
  .filter-btn.active {
    background: #fff;
    border-color: #fff;
    color: #000;
  }

  .table-wrap {
    overflow-x: auto;
    max-height: 460px;
    scrollbar-width: thin;
  }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th {
    text-align: left; padding: 8px 10px;
    color: var(--text-dim); font-weight: 600;
    font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.4px;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0;
    background: var(--surface);
  }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tr:hover td { background: rgba(255,255,255,0.03); }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-weight: 600;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .badge.success { background: var(--green-bg); color: var(--green); }
  .badge.failure { background: var(--red-bg); color: var(--red); }
  .badge.ongoing {
    background: var(--yellow-bg);
    color: var(--yellow);
  }
  .blink { animation: blink 1s ease-in-out infinite; }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  @keyframes flash {
    0% { background: rgba(34,197,94,0.15); }
    100% { background: transparent; }
  }
  .row-flash { animation: flash 1s ease-out; }

  .log-box {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px; line-height: 1.6;
    color: var(--text);
    background: #000;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px;
    overflow-y: auto;
    flex: 1;
    min-height: 300px;
    max-height: 500px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .log-search {
    width: 100%;
    background: #000;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--text); outline: none;
    margin-bottom: 10px;
    transition: border-color 0.2s;
  }
  .log-search:focus { border-color: #333; }

  .footer {
    text-align: center;
    padding: 20px;
    color: var(--text-muted);
    font-size: 10px;
    letter-spacing: 0.3px;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .modal-overlay.active { display: flex; }
  .modal {
    background: #0a0a0a;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px;
    max-width: 340px;
    width: 90%;
    text-align: center;
  }
  .modal h2 {
    font-size: 15px; font-weight: 700;
    margin-bottom: 6px; color: var(--text);
    letter-spacing: -0.2px;
  }
  .modal p {
    color: var(--text-dim);
    font-size: 12px; margin-bottom: 20px;
    line-height: 1.5;
  }
  .modal-input {
    width: 100%;
    background: #000;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px; text-align: center;
    letter-spacing: 4px; margin-bottom: 16px;
    font-family: 'JetBrains Mono', monospace;
    outline: none; color: var(--text);
  }
  .modal-input:focus { border-color: var(--red); }
  .modal-actions { display: flex; gap: 8px; }
  .modal-btn {
    flex: 1; padding: 10px;
    border-radius: 8px; font-weight: 600;
    font-size: 11px; cursor: pointer;
    transition: all 0.15s; font-family: inherit;
  }
  .modal-btn.cancel {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
  }
  .modal-btn.cancel:hover { border-color: #333; color: var(--text); }
  .modal-btn.kill {
    background: var(--red); border: none;
    color: #fff;
  }
  .modal-btn.kill:hover { background: #dc2626; }

  .toast {
    position: fixed; bottom: 24px; right: 24px;
    background: #0a0a0a; border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 16px;
    font-size: 11px; color: var(--text);
    transform: translateY(100px); opacity: 0;
    transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    z-index: 999;
    max-width: 300px;
    pointer-events: none;
  }
  .toast.show { transform: translateY(0); opacity: 1; }
</style>
</head>
<body>
<div class="splash" id="splash"><span id="splash-text">SNAKEKING</span></div>
<div class="header">
  <div class="brand">
    <div class="brand-dot"></div>
    <h1>DB-CHOCK</h1>
    <span>LIVE</span>
  </div>
  <div class="header-actions">
    <span class="last-updated" id="last-updated">--</span>
    <button class="kill-btn" onclick="openKillModal()">✕ KILL</button>
  </div>
</div>

<div class="container">
  <div class="stats-row">
    <div class="stat"><div class="stat-label">Target</div><div class="stat-val dim" id="stat-total">0</div></div>
    <div class="stat"><div class="stat-label">Success</div><div class="stat-val green" id="stat-success">0</div></div>
    <div class="stat"><div class="stat-label">Failed</div><div class="stat-val red" id="stat-failed">0</div></div>
    <div class="stat"><div class="stat-label">Done</div><div class="stat-val" id="stat-completed">0</div></div>
    <div class="stat"><div class="stat-label">Left</div><div class="stat-val dim" id="stat-remaining">0</div></div>
  </div>

  <div class="progress-wrap">
    <div class="progress-header">
      <span class="progress-title">Progress</span>
      <span class="progress-pct" id="progress-pct">0%</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" id="progress-fill"></div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-header">
        <h3>Records</h3>
        <span class="count-badge" id="records-count">0</span>
      </div>
      <input type="text" class="search-input" id="table-search" placeholder="Search..." oninput="filterTable()">
      <div class="filter-row">
        <button class="filter-btn active" data-f="ALL">ALL</button>
        <button class="filter-btn" data-f="SUCCESS">OK</button>
        <button class="filter-btn" data-f="FAILURE">FAIL</button>
        <button class="filter-btn" data-f="ONGOING">ONGOING</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Event</th><th>Status</th></tr></thead>
          <tbody id="records-body"></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Console</h3>
      </div>
      <input type="text" class="log-search" id="log-search" placeholder="Filter logs..." oninput="filterLogs()">
      <div class="log-box" id="log-box"></div>
    </div>
  </div>

  <div class="footer">DB-CHOCK CONSOLE · UPDATES EVERY 2s</div>
</div>

<div class="modal-overlay" id="kill-modal">
  <div class="modal">
    <h2>Terminate</h2>
    <p>This will kill all active bot processes and stop the dashboard.</p>
    <input type="password" class="modal-input" id="kill-password" placeholder="password" autofocus>
    <div class="modal-actions">
      <button class="modal-btn cancel" onclick="closeKillModal()">CANCEL</button>
      <button class="modal-btn kill" onclick="submitKill()">KILL</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
  let allRows = [];
  let ongoingList = [];
  let statusFilter = 'ALL';
  let activeLogText = '';
  let prevOngoingKeys = {};
  let prevCount = 0;

  function animateVal(el, target) {
    const curr = parseInt(el.dataset.val || '0');
    if (curr === target) return;
    el.dataset.val = target;
    const diff = target - curr;
    const steps = Math.min(Math.abs(diff), 20);
    const step = diff / steps;
    let c = curr;
    const tick = () => {
      c += step;
      if ((step > 0 && c >= target) || (step < 0 && c <= target)) {
        el.textContent = target;
        return;
      }
      el.textContent = Math.round(c);
      requestAnimationFrame(tick);
    };
    tick();
  }

  async function update() {
    try {
      const res = await fetch('/api/data');
      const data = await res.json();
      allRows = data.rows || [];
      ongoingList = data.ongoing || [];

      const inf = data.total === 999999;
      animateVal(document.getElementById('stat-total'), inf ? 0 : data.total);
      document.getElementById('stat-total').textContent = inf ? '∞' : data.total;
      animateVal(document.getElementById('stat-success'), data.success);
      animateVal(document.getElementById('stat-failed'), data.failed);
      animateVal(document.getElementById('stat-completed'), data.completed);
      document.getElementById('stat-remaining').textContent = inf ? '∞' : Math.max(0, data.total - data.completed);

      const pct = data.total > 0 && !inf ? Math.min(100, Math.round(data.completed / data.total * 100)) : 0;
      document.getElementById('progress-pct').textContent = inf ? (data.completed + ' done') : (pct + '% (' + data.completed + '/' + data.total + ')');
      document.getElementById('progress-fill').style.width = (inf ? 0 : pct) + '%';
      document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();

      if (data.completed > prevCount && prevCount > 0) {
        showToast('+' + (data.completed - prevCount) + ' new registration' + (data.completed - prevCount > 1 ? 's' : ''));
      }
      prevCount = data.completed;

      filterTable();
      activeLogText = data.logTail || '';
      filterLogs();
    } catch(e) {}
  }

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      statusFilter = btn.dataset.f;
      filterTable();
    });
  });

  function filterTable() {
    const q = document.getElementById('table-search').value.toLowerCase();
    const body = document.getElementById('records-body');
    body.innerHTML = '';

    const currentKeys = {};
    ongoingList.forEach(r => { currentKeys[(r.name + '|' + r.email).toLowerCase()] = 1; });

    const combined = [];
    allRows.forEach(r => {
      const key = (r['Full Name'] + '|' + r.Email).toLowerCase();
      const ts = r.Timestamp ? new Date(r.Timestamp).getTime() : 0;
      const isNew = prevOngoingKeys[key] !== undefined && !prevOngoingKeys[key] ? true : false;
      combined.push({ _key: key, _sort: ts, _status: r.Status, _name: r['Full Name'] || '-', _event: r['Event Name'] || '-', _isNew: isNew });
    });
    ongoingList.forEach(r => {
      const key = (r.name + '|' + r.email).toLowerCase();
      const ts = r.startedAt ? new Date(r.startedAt).getTime() : Date.now();
      combined.push({ _key: key, _sort: ts, _status: 'ONGOING', _name: r.name || '-', _event: r.event || '-', _isNew: 0 });
    });

    combined.sort((a, b) => b._sort - a._sort);
    prevOngoingKeys = currentKeys;

    const filtered = combined.filter(r => {
      const s = (r._name + ' ' + r._status).toLowerCase();
      if (!s.includes(q)) return false;
      if (statusFilter === 'SUCCESS') return r._status === 'SUCCESS';
      if (statusFilter === 'FAILURE') return r._status === 'FAILURE';
      if (statusFilter === 'ONGOING') return r._status === 'ONGOING';
      return true;
    });

    document.getElementById('records-count').textContent = filtered.length;

    filtered.slice(0, 100).forEach((r, i) => {
      const cls = r._status === 'SUCCESS' ? 'success' : r._status === 'FAILURE' ? 'failure' : 'ongoing';
      const tr = document.createElement('tr');
      if (r._isNew) tr.className = 'row-flash';
      const nameShort = r._name.length > 16 ? r._name.slice(0, 16) + '…' : r._name;
      const evShort = r._event.length > 20 ? r._event.slice(0, 20) + '…' : r._event;
      tr.innerHTML = '<td>' + (i + 1) + '</td>' +
        '<td title="' + r._name.replace(/"/g,'&quot;') + '">' + nameShort + '</td>' +
        '<td title="' + r._event.replace(/"/g,'&quot;') + '">' + evShort + '</td>' +
        '<td><span class="badge ' + cls + (r._status === 'ONGOING' ? ' blink' : '') + '">' + r._status + '</span></td>';
      body.appendChild(tr);
    });
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#444;padding:32px;font-size:12px">No records</td></tr>';
    }
  }

  function filterLogs() {
    const q = document.getElementById('log-search').value.toLowerCase();
    const box = document.getElementById('log-box');
    const lines = activeLogText.split('\n').filter(l => l.toLowerCase().includes(q));
    box.textContent = lines.join('\n');
    box.scrollTop = box.scrollHeight;
  }

  let toastTimer;

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  function openKillModal() {
    document.getElementById('kill-modal').classList.add('active');
    document.getElementById('kill-password').focus();
  }
  function closeKillModal() {
    document.getElementById('kill-modal').classList.remove('active');
    document.getElementById('kill-password').value = '';
  }
  async function submitKill() {
    const pwd = document.getElementById('kill-password').value;
    if (!pwd) return;
    try {
      const res = await fetch('/api/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      if (res.ok) {
        document.querySelector('.modal').innerHTML = '<h2 style="color:var(--green)">Terminated</h2><p style="color:var(--text-dim)">All processes have been stopped.</p>';
      } else {
        document.getElementById('kill-password').value = '';
        document.getElementById('kill-password').focus();
      }
    } catch(e) {}
  }
  document.getElementById('kill-password').addEventListener('keydown', e => { if (e.key === 'Enter') submitKill(); });

  (function splashSequence() {
    const splash = document.getElementById('splash');
    const text = document.getElementById('splash-text');
    if (!splash) return;

    // Phase 1: 0–0.8s — fade in, black bg white text
    text.style.animation = 'splashFadeIn 0.8s ease forwards';

    // Phase 2: 0.8s–2.8s — zoom in text (scale 1→1.4)
    setTimeout(() => {
      text.style.animation = 'splashZoomIn 2s ease forwards';
    }, 800);

    // Phase 3: 2.8s–3.6s — smooth invert (bg black→white, text white→black)
    setTimeout(() => {
      splash.style.background = '#fff';
      text.style.color = '#000';
    }, 2800);

    // Phase 4: 3.6s–5.6s — zoom out text (scale 1.4→1) on white bg black text
    setTimeout(() => {
      text.style.animation = 'splashZoomOut 2s ease forwards';
    }, 3600);

    // Phase 5: 5.6s–6.6s — fade out
    setTimeout(() => {
      text.style.animation = 'splashFadeOut 1s ease forwards';
      splash.style.background = 'transparent';
    }, 5600);

    // Cleanup: remove splash from DOM
    setTimeout(() => {
      splash.remove();
    }, 6800);
  })();

  update();
  setInterval(update, 2000);
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/kill') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.password === 'Gcem') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          exec('pkill -f "cloudflared" 2>/dev/null; pkill -f "estralis-bot/index.js" 2>/dev/null', () => {
            process.exit(0);
          });
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Wrong password' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid' }));
      }
    });
  } else if (req.url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(apiData());
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildDashboard());
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Dashboard: http://localhost:${PORT}`);
});
