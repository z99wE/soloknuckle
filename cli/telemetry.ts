import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '.soloknuckle');
const TELEMETRY_FILE = path.join(DATA_DIR, 'telemetry.json');

export function initTelemetry() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TELEMETRY_FILE)) {
    fs.writeFileSync(TELEMETRY_FILE, JSON.stringify({
      humanCommits: 0,
      aiCommits: 0,
      linesByHuman: 0,
      linesByAi: 0,
    }, null, 2));
  }
}

export function logTelemetry(isAi: boolean, linesChanged: number) {
  initTelemetry();
  const data = JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf-8'));
  
  if (isAi) {
    data.aiCommits += 1;
    data.linesByAi += linesChanged;
  } else {
    data.humanCommits += 1;
    data.linesByHuman += linesChanged;
  }

  fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(data, null, 2));
  return data;
}

export function getTelemetry() {
  initTelemetry();
  return JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf-8'));
}
