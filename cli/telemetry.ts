import fs from 'fs';
import path from 'path';

function getDataDir() {
  return path.join(process.cwd(), '.soloknuckle');
}

function getTelemetryFile() {
  return path.join(getDataDir(), 'telemetry.json');
}

export function initTelemetry() {
  const dataDir = getDataDir();
  const telemetryFile = getTelemetryFile();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(telemetryFile)) {
    fs.writeFileSync(telemetryFile, JSON.stringify({
      humanCommits: 0,
      aiCommits: 0,
      linesByHuman: 0,
      linesByAi: 0,
    }, null, 2));
  }
}

export function logTelemetry(isAi: boolean, linesChanged: number) {
  initTelemetry();
  const telemetryFile = getTelemetryFile();
  let data: Record<string, number>;
  try {
    data = JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
  } catch {
    data = { humanCommits: 0, aiCommits: 0, linesByHuman: 0, linesByAi: 0 };
  }
  
  if (isAi) {
    data.aiCommits += 1;
    data.linesByAi += linesChanged;
  } else {
    data.humanCommits += 1;
    data.linesByHuman += linesChanged;
  }

  fs.writeFileSync(telemetryFile, JSON.stringify(data, null, 2));
  return data;
}

export function getTelemetry() {
  initTelemetry();
  const telemetryFile = getTelemetryFile();
  return JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
}
