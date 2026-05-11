
const fs = require('fs');
const path = require('path');

const CSV_FILE = path.join(__dirname, '..', 'output.csv');

const HEADERS = [
  'Timestamp',
  'Event Name',
  'Full Name',
  'Email',
  'Phone',
  'College',
  'Branch',
  'Semester',
  'UTR',
  'Sender UPI',
  'Payee UPI',
  'Registration Reference Number',
  'Status',
];

function escapeCsv(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function ensureCsvFile() {
  if (!fs.existsSync(CSV_FILE)) {
    fs.writeFileSync(CSV_FILE, HEADERS.map(escapeCsv).join(',') + '\n', 'utf-8');
    console.log('[CSV] Created output.csv with headers');
  }
}

function appendRecord(data) {
  ensureCsvFile();

  const row = [
    new Date().toISOString(),
    data.eventName || '',
    data.fullName || '',
    data.email || '',
    data.phone || '',
    data.college || '',
    data.branch || '',
    data.semester || '',
    data.utr || '',
    data.senderUpi || '',
    data.payeeUpi || '',
    data.referenceNumber || '',
    data.status || 'UNKNOWN',
  ];

  const csvLine = row.map(escapeCsv).join(',') + '\n';
  fs.appendFileSync(CSV_FILE, csvLine, 'utf-8');
  console.log(`[CSV] Record appended for: ${data.fullName}`);
}

module.exports = { ensureCsvFile, appendRecord, HEADERS };
