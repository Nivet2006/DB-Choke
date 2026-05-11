const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = parseInt(process.argv[2], 10) || 4000;
const CSV_PATH = path.join(__dirname, '..', 'output.csv');
const NAMES_PATH = path.join(__dirname, '..', 'NAMES.TXT');
const LOG_DIR = path.join(__dirname, '..', 'logs');

function parseCSV() {
  if (!fs.existsSync(CSV_PATH)) return { headers: [], rows: [], raw: '' };
  const content = fs.readFileSync(CSV_PATH, 'utf-8').trim();
  if (!content) return { headers: [], rows: [], raw: '' };
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].match(/(".*?"|[^,]+)/g) || [];
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').replace(/"/g, '').trim(); });
    rows.push(row);
  }
  return { headers, rows, raw: content };
}

function getTotalTarget() {
  if (!fs.existsSync(NAMES_PATH)) return 0;
  return fs.readFileSync(NAMES_PATH, 'utf-8').split('\n').filter(l => l.trim()).length;
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
  const failed = rows.filter(r => r.Status && r.Status.startsWith('FAILED')).length;
  const logTail = getLatestLog(50);
  return JSON.stringify({ total, success, failed, completed: rows.length, rows, logTail });
}

function buildDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DATABASE CHOCKE ft. SNAKEKING — Console</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', sans-serif;
    background: #06060c;
    color: #f3f4f6;
    min-height: 100vh;
    overflow-x: hidden;
  }
  .header {
    background: linear-gradient(135deg, #090915 0%, #150824 50%, #05101f 100%);
    border-bottom: 1px solid rgba(139, 92, 246, 0.3);
    padding: 20px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(12px);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand h1 {
    font-size: 20px;
    font-weight: 800;
    background: linear-gradient(135deg, #c084fc, #6366f1, #38bdf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.5px;
  }
  .live-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #4ade80;
    background: rgba(74, 222, 128, 0.1);
    padding: 6px 14px;
    border-radius: 9999px;
    border: 1px solid rgba(74, 222, 128, 0.2);
  }
  .live-dot {
    width: 8px;
    height: 8px;
    background: #4ade80;
    border-radius: 50%;
    box-shadow: 0 0 12px #4ade80;
    animation: pulse 1.5s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
  }
  .kill-btn {
    background: linear-gradient(135deg, #ef4444, #b91c1c);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .kill-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 0 25px rgba(239, 68, 68, 0.7);
    background: linear-gradient(135deg, #f87171, #dc2626);
  }
  .container {
    max-width: 1600px;
    margin: 0 auto;
    padding: 32px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 20px;
    margin-bottom: 32px;
  }
  @media (max-width: 1200px) {
    .stats-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 768px) {
    .stats-grid { grid-template-columns: 1fr; }
  }
  .stat-card {
    background: rgba(17, 17, 28, 0.7);
    border: 1px solid rgba(139, 92, 246, 0.15);
    border-radius: 20px;
    padding: 24px;
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(8px);
    transition: transform 0.3s ease, border-color 0.3s ease;
  }
  .stat-card:hover {
    transform: translateY(-3px);
    border-color: rgba(139, 92, 246, 0.3);
  }
  .stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
  }
  .stat-card.target::before { background: linear-gradient(90deg, #c084fc, #a855f7); }
  .stat-card.success::before { background: linear-gradient(90deg, #4ade80, #22c55e); }
  .stat-card.failed::before { background: linear-gradient(90deg, #f87171, #ef4444); }
  .stat-card.completed::before { background: linear-gradient(90deg, #60a5fa, #3b82f6); }
  .stat-card.remaining::before { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
  .stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #9ca3af;
    margin-bottom: 12px;
    font-weight: 600;
  }
  .stat-val {
    font-size: 40px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -1px;
  }
  .stat-card.target .stat-val { color: #c084fc; text-shadow: 0 0 15px rgba(192, 132, 252, 0.2); }
  .stat-card.success .stat-val { color: #4ade80; text-shadow: 0 0 15px rgba(74, 222, 128, 0.2); }
  .stat-card.failed .stat-val { color: #f87171; text-shadow: 0 0 15px rgba(248, 113, 113, 0.2); }
  .stat-card.completed .stat-val { color: #60a5fa; text-shadow: 0 0 15px rgba(96, 165, 250, 0.2); }
  .stat-card.remaining .stat-val { color: #fbbf24; text-shadow: 0 0 15px rgba(251, 191, 36, 0.2); }
  .progress-wrap {
    background: rgba(17, 17, 28, 0.7);
    border: 1px solid rgba(139, 92, 246, 0.15);
    border-radius: 20px;
    padding: 24px;
    margin-bottom: 32px;
    backdrop-filter: blur(8px);
  }
  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .progress-title {
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.5px;
    color: #e5e7eb;
  }
  .progress-pct {
    font-weight: 800;
    color: #c084fc;
    font-size: 16px;
  }
  .progress-bar-bg {
    width: 100%;
    height: 14px;
    background: rgba(139, 92, 246, 0.08);
    border-radius: 9999px;
    overflow: hidden;
    border: 1px solid rgba(139, 92, 246, 0.15);
  }
  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #c084fc, #6366f1, #38bdf8, #4ade80);
    border-radius: 9999px;
    width: 0%;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.5);
  }
  .visuals-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin-bottom: 32px;
  }
  @media (max-width: 1024px) {
    .visuals-grid { grid-template-columns: 1fr; }
  }
  .chart-card {
    background: rgba(17, 17, 28, 0.7);
    border: 1px solid rgba(139, 92, 246, 0.15);
    border-radius: 20px;
    padding: 24px;
    backdrop-filter: blur(8px);
    min-height: 320px;
    display: flex;
    flex-direction: column;
  }
  .chart-card h3 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #9ca3af;
    margin-bottom: 20px;
    font-weight: 700;
    border-left: 3px solid #c084fc;
    padding-left: 10px;
  }
  .chart-container {
    flex-grow: 1;
    position: relative;
    width: 100%;
    height: 100%;
  }
  .main-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 24px;
    margin-bottom: 32px;
  }
  @media (max-width: 1200px) {
    .main-grid { grid-template-columns: 1fr; }
  }
  .panel-card {
    background: rgba(17, 17, 28, 0.7);
    border: 1px solid rgba(139, 92, 246, 0.15);
    border-radius: 20px;
    padding: 24px;
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
  }
  .panel-card h3 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #9ca3af;
    margin-bottom: 20px;
    font-weight: 700;
    border-left: 3px solid #6366f1;
    padding-left: 10px;
  }
  .control-row {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .search-input {
    flex-grow: 1;
    background: rgba(6, 6, 12, 0.5);
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 12px;
    padding: 12px 18px;
    color: white;
    font-size: 13px;
    transition: all 0.3s ease;
  }
  .search-input:focus {
    outline: none;
    border-color: #c084fc;
    box-shadow: 0 0 15px rgba(192, 132, 252, 0.15);
  }
  .filter-btn {
    background: rgba(139, 92, 246, 0.08);
    border: 1px solid rgba(139, 92, 246, 0.2);
    color: #d1d5db;
    padding: 10px 20px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.3s ease;
  }
  .filter-btn:hover {
    background: rgba(139, 92, 246, 0.15);
    border-color: rgba(139, 92, 246, 0.4);
    color: white;
  }
  .filter-btn.active {
    background: #6366f1;
    border-color: #6366f1;
    color: white;
    box-shadow: 0 0 15px rgba(99, 102, 241, 0.3);
  }
  .table-container {
    overflow-x: auto;
    max-height: 600px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    text-align: left;
    padding: 14px 16px;
    background: rgba(139, 92, 246, 0.05);
    color: #c084fc;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid rgba(139, 92, 246, 0.15);
  }
  td {
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    color: #d1d5db;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tr {
    transition: background 0.2s ease;
  }
  tr:hover td {
    background: rgba(139, 92, 246, 0.04);
  }
  .status-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 9999px;
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .status-badge.success {
    background: rgba(74, 222, 128, 0.1);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.2);
  }
  .status-badge.failed {
    background: rgba(248, 113, 113, 0.1);
    color: #f87171;
    border: 1px solid rgba(248, 113, 113, 0.2);
  }
  .log-viewer {
    background: #040408;
    border: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 16px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .log-header h3 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #9ca3af;
    font-weight: 700;
    border-left: 3px solid #38bdf8;
    padding-left: 10px;
  }
  .log-search {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 6px 12px;
    color: white;
    font-size: 11px;
    width: 150px;
  }
  .log-box {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    line-height: 1.6;
    color: #a7f3d0;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 12px;
    padding: 16px;
    overflow-y: auto;
    flex-grow: 1;
    max-height: 520px;
    white-space: pre-wrap;
    word-break: break-all;
    border: 1px solid rgba(255, 255, 255, 0.03);
  }
  .footer {
    text-align: center;
    padding: 40px 20px;
    color: #4b5563;
    font-size: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.02);
    margin-top: 40px;
    letter-spacing: 0.5px;
  }
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(4, 4, 8, 0.85);
    backdrop-filter: blur(16px);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .modal-overlay.active {
    display: flex;
    opacity: 1;
  }
  .modal {
    background: linear-gradient(135deg, #0d0d1a 0%, #1c0a2a 100%);
    border: 1px solid #ef4444;
    border-radius: 24px;
    padding: 40px;
    max-width: 450px;
    width: 90%;
    box-shadow: 0 0 50px rgba(239, 68, 68, 0.25);
    text-align: center;
    transform: scale(0.9);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .modal-overlay.active .modal {
    transform: scale(1);
  }
  .modal-icon {
    width: 64px;
    height: 64px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    margin: 0 auto 24px;
    border: 1px solid rgba(239, 68, 68, 0.2);
    animation: pulse-red 2s infinite;
  }
  @keyframes pulse-red {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
    50% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
  }
  .modal h2 {
    font-size: 20px;
    font-weight: 800;
    color: #f3f4f6;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .modal p {
    color: #9ca3af;
    font-size: 13px;
    margin-bottom: 24px;
    line-height: 1.5;
  }
  .modal-input {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(23ef, 68, 68, 0.3);
    border-radius: 12px;
    padding: 14px 18px;
    color: white;
    font-size: 14px;
    text-align: center;
    letter-spacing: 4px;
    margin-bottom: 16px;
    font-family: 'JetBrains Mono', monospace;
  }
  .modal-input:focus {
    outline: none;
    border-color: #ef4444;
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.2);
  }
  .modal-actions {
    display: flex;
    gap: 12px;
  }
  .modal-btn {
    flex: 1;
    padding: 14px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-transform: uppercase;
  }
  .modal-btn.cancel {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #d1d5db;
  }
  .modal-btn.cancel:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }
  .modal-btn.confirm {
    background: #ef4444;
    border: none;
    color: white;
    box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3);
  }
  .modal-btn.confirm:hover {
    background: #dc2626;
    box-shadow: 0 4px 20px rgba(239, 68, 68, 0.5);
  }
  .error-shake {
    animation: shake 0.4s ease;
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
  }
</style>
</head>
<body>
<div class="header">
  <div class="brand">
    <h1>⚡ DATABASE CHOCKE ft. SNAKEKING</h1>
    <div class="live-indicator"><div class="live-dot"></div>LIVE MONITOR</div>
  </div>
  <button class="kill-btn" onclick="openKillModal()">⚠️ KILL SWITCH</button>
</div>

<div class="container">
  <div class="stats-grid">
    <div class="stat-card target">
      <div class="stat-label">Target Total</div>
      <div class="stat-val" id="stat-total">0</div>
    </div>
    <div class="stat-card success">
      <div class="stat-label">Successes</div>
      <div class="stat-val" id="stat-success">0</div>
    </div>
    <div class="stat-card failed">
      <div class="stat-label">Failures</div>
      <div class="stat-val" id="stat-failed">0</div>
    </div>
    <div class="stat-card completed">
      <div class="stat-label">Completed</div>
      <div class="stat-val" id="stat-completed">0</div>
    </div>
    <div class="stat-card remaining">
      <div class="stat-label">Remaining</div>
      <div class="stat-val" id="stat-remaining">0</div>
    </div>
  </div>

  <div class="progress-wrap">
    <div class="progress-header">
      <span class="progress-title">Global Progress Tracker</span>
      <span class="progress-pct" id="progress-pct">0%</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" id="progress-fill"></div>
    </div>
  </div>

  <div class="visuals-grid">
    <div class="chart-card">
      <h3>Registration Performance</h3>
      <div class="chart-container">
        <canvas id="ratioChart"></canvas>
      </div>
    </div>
    <div class="chart-card">
      <h3>Event Distribution</h3>
      <div class="chart-container">
        <canvas id="eventChart"></canvas>
      </div>
    </div>
    <div class="chart-card">
      <h3>Academic College Split</h3>
      <div class="chart-container">
        <canvas id="collegeChart"></canvas>
      </div>
    </div>
  </div>

  <div class="main-grid">
    <div class="panel-card">
      <h3>Active Records Log</h3>
      <div class="control-row">
        <input type="text" class="search-input" id="table-search" placeholder="Search by Name, Email, UTR, College or Status..." oninput="filterTable()">
        <button class="filter-btn active" onclick="setFilter('ALL', this)">ALL</button>
        <button class="filter-btn" onclick="setFilter('SUCCESS', this)">SUCCESS</button>
        <button class="filter-btn" onclick="setFilter('FAILED', this)">FAILED</button>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Name</th>
              <th>Email</th>
              <th>UTR</th>
              <th>College</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="records-body"></tbody>
        </table>
      </div>
    </div>

    <div class="log-viewer">
      <div class="log-header">
        <h3>Live System Output</h3>
        <input type="text" class="log-search" id="log-search" placeholder="Filter console logs..." oninput="filterLogs()">
      </div>
      <div class="log-box" id="log-box"></div>
    </div>
  </div>

  <div class="footer">DATABASE CHOCKE CONSOLE SYSTEM • REAL-TIME INTERACTIVE PIPELINE</div>
</div>

<div class="modal-overlay" id="kill-modal">
  <div class="modal" id="modal-box">
    <div class="modal-icon">☣️</div>
    <h2>SYSTEM SHUTDOWN DEMANDED</h2>
    <p>This action will terminate all active playwright workers, abort existing registrations, close live connection streams, and completely kill this control panel server instantly.</p>
    <input type="password" class="modal-input" id="kill-password" placeholder="••••" autofocus>
    <div class="modal-actions">
      <button class="modal-btn cancel" onclick="closeKillModal()">CANCEL</button>
      <button class="modal-btn confirm" onclick="submitKill()">TERMINATE CORE</button>
    </div>
  </div>
</div>

<script>
  let ratioChart, eventChart, collegeChart;
  let allRows = [];
  let statusFilter = 'ALL';
  let activeLogText = '';

  function initCharts() {
    const ctxRatio = document.getElementById('ratioChart').getContext('2d');
    ratioChart = new Chart(ctxRatio, {
      type: 'doughnut',
      data: {
        labels: ['Success', 'Failed'],
        datasets: [{
          data: [0, 0],
          backgroundColor: ['#4ade80', '#f87171'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#9ca3af', font: { family: 'Inter', size: 11 } }
          }
        }
      }
    });

    const ctxEvent = document.getElementById('eventChart').getContext('2d');
    eventChart = new Chart(ctxEvent, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Registrations',
          data: [],
          backgroundColor: '#6366f1',
          borderRadius: 6,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af' } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });

    const ctxCollege = document.getElementById('collegeChart').getContext('2d');
    collegeChart = new Chart(ctxCollege, {
      type: 'polarArea',
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: [
            'rgba(192, 132, 252, 0.6)',
            'rgba(99, 102, 241, 0.6)',
            'rgba(56, 189, 248, 0.6)',
            'rgba(74, 222, 128, 0.6)',
            'rgba(251, 191, 36, 0.6)'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            angleLines: { color: 'rgba(255,255,255,0.05)' },
            ticks: { display: false }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#9ca3af', font: { family: 'Inter', size: 9 } }
          }
        }
      }
    });
  }

  async function updateDashboardData() {
    try {
      const res = await fetch('/api/data');
      const data = await res.json();
      allRows = data.rows;

      document.getElementById('stat-total').innerText = data.total;
      document.getElementById('stat-success').innerText = data.success;
      document.getElementById('stat-failed').innerText = data.failed;
      document.getElementById('stat-completed').innerText = data.completed;
      document.getElementById('stat-remaining').innerText = Math.max(0, data.total - data.completed);

      const pct = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
      document.getElementById('progress-pct').innerText = pct + '% (' + data.completed + '/' + data.total + ')';
      document.getElementById('progress-fill').style.width = Math.min(pct, 100) + '%';

      ratioChart.data.datasets[0].data = [data.success, data.failed];
      ratioChart.update();

      const events = {};
      const colleges = {};
      data.rows.forEach(r => {
        const ev = r['Event Name'] || 'Unknown';
        events[ev] = (events[ev] || 0) + 1;
        const col = r.College || 'Unknown';
        colleges[col] = (colleges[col] || 0) + 1;
      });

      const sortedEvents = Object.entries(events).sort((a,b) => b[1]-a[1]).slice(0, 8);
      eventChart.data.labels = sortedEvents.map(e => e[0].slice(0, 15));
      eventChart.data.datasets[0].data = sortedEvents.map(e => e[1]);
      eventChart.update();

      const sortedColleges = Object.entries(colleges).sort((a,b) => b[1]-a[1]).slice(0, 5);
      collegeChart.data.labels = sortedColleges.map(c => c[0].slice(0, 15));
      collegeChart.data.datasets[0].data = sortedColleges.map(c => c[1]);
      collegeChart.update();

      filterTable();

      activeLogText = data.logTail || 'No logs yet';
      filterLogs();

    } catch (err) {}
  }

  function setFilter(filter, el) {
    statusFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    filterTable();
  }

  function filterTable() {
    const searchVal = document.getElementById('table-search').value.toLowerCase();
    const recordsBody = document.getElementById('records-body');
    recordsBody.innerHTML = '';

    const filtered = allRows.filter(r => {
      const matchSearch = 
        (r['Full Name'] || '').toLowerCase().includes(searchVal) ||
        (r.Email || '').toLowerCase().includes(searchVal) ||
        (r.UTR || '').toLowerCase().includes(searchVal) ||
        (r.College || '').toLowerCase().includes(searchVal) ||
        (r.Status || '').toLowerCase().includes(searchVal);

      if (statusFilter === 'SUCCESS') return matchSearch && r.Status === 'SUCCESS';
      if (statusFilter === 'FAILED') return matchSearch && r.Status && r.Status.startsWith('FAILED');
      return matchSearch;
    });

    const displayRows = filtered.slice(-100).reverse();
    displayRows.forEach((r, i) => {
      const rowIdx = filtered.length - i;
      const time = r.Timestamp ? new Date(r.Timestamp).toLocaleTimeString('en-IN') : '-';
      const badgeClass = r.Status === 'SUCCESS' ? 'success' : 'failed';
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td>\${rowIdx}</td>
        <td>\${time}</td>
        <td>\${r['Full Name'] || '-'}</td>
        <td>\${r.Email || '-'}</td>
        <td>\${r.UTR || '-'}</td>
        <td title="\${r.College || ''}">\${(r.College || '-').slice(0, 20)}</td>
        <td><span class="status-badge \${badgeClass}">\${r.Status || '-'}</span></td>
      \`;
      recordsBody.appendChild(tr);
    });

    if (displayRows.length === 0) {
      recordsBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#4b5563;padding:40px">No matching records found</td></tr>';
    }
  }

  function filterLogs() {
    const query = document.getElementById('log-search').value.toLowerCase();
    const logBox = document.getElementById('log-box');
    const lines = activeLogText.split('\\n');
    const filteredLines = lines.filter(l => l.toLowerCase().includes(query));
    logBox.innerHTML = filteredLines.join('\\n').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    logBox.scrollTop = logBox.scrollHeight;
  }

  function openKillModal() {
    const modal = document.getElementById('kill-modal');
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.add('active');
      document.getElementById('kill-password').focus();
    }, 10);
  }

  function closeKillModal() {
    const modal = document.getElementById('kill-modal');
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 300);
    document.getElementById('kill-password').value = '';
  }

  async function submitKill() {
    const pwdInput = document.getElementById('kill-password');
    const modalBox = document.getElementById('modal-box');
    const password = pwdInput.value;

    if (!password) {
      shakeModal();
      return;
    }

    try {
      const res = await fetch('/api/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (res.ok) {
        modalBox.innerHTML = \`
          <div class="modal-icon" style="color:#10b981;background:rgba(16,185,129,0.1);border-color:rgba(16,185,129,0.2)">☠️</div>
          <h2 style="color:#10b981">EXECUTION IN PROGRESS</h2>
          <p style="color:#d1d5db;margin-bottom:0">All connection sockets, active playwright windows, proxy nodes, and background bot workers have been forcefully terminated. This control panel will now shut down.</p>
        \`;
        setTimeout(() => { window.close(); }, 4000);
      } else {
        shakeModal();
      }
    } catch (err) {
      shakeModal();
    }
  }

  function shakeModal() {
    const modalBox = document.getElementById('modal-box');
    modalBox.classList.add('error-shake');
    setTimeout(() => { modalBox.classList.remove('error-shake'); }, 400);
    document.getElementById('kill-password').value = '';
    document.getElementById('kill-password').focus();
  }

  window.onload = () => {
    initCharts();
    updateDashboardData();
    setInterval(updateDashboardData, 2000);
  };
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/kill') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.password === 'Gcem') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          const isWin = process.platform === 'win32';
          const killCmd = isWin
            ? 'powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \'*index.js*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"'
            : 'pkill -f "node.*index.js"';
          exec(killCmd, () => {
            process.exit(0);
          });
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Incorrect password' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request' }));
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
  console.log(`\n╔═══════════════════════════════════════════════════╗`);
  console.log(`║  Dashboard running at http://localhost:${PORT}      ║`);
  console.log(`╚═══════════════════════════════════════════════════╝`);
});
