import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-telemetry');

describe('telemetry', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    fs.mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    const telemetryDir = path.join(TEST_DIR, '.soloknuckle');
    if (fs.existsSync(telemetryDir)) {
      fs.rmSync(telemetryDir, { recursive: true, force: true });
    }
  });

  it('initTelemetry should create .soloknuckle directory and telemetry.json', async () => {
    const { initTelemetry } = await import('../cli/telemetry');
    initTelemetry();
    const dir = path.join(TEST_DIR, '.soloknuckle');
    const file = path.join(dir, 'telemetry.json');
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('initTelemetry should create default telemetry data', async () => {
    const { initTelemetry, getTelemetry } = await import('../cli/telemetry');
    initTelemetry();
    const data = getTelemetry();
    expect(data.humanCommits).toBe(0);
    expect(data.aiCommits).toBe(0);
    expect(data.linesByHuman).toBe(0);
    expect(data.linesByAi).toBe(0);
  });

  it('logTelemetry should increment AI commits', async () => {
    const { initTelemetry, logTelemetry, getTelemetry } = await import('../cli/telemetry');
    initTelemetry();
    logTelemetry(true, 42);
    const data = getTelemetry();
    expect(data.aiCommits).toBe(1);
    expect(data.linesByAi).toBe(42);
  });

  it('logTelemetry should increment human commits', async () => {
    const { initTelemetry, logTelemetry, getTelemetry } = await import('../cli/telemetry');
    initTelemetry();
    logTelemetry(false, 15);
    const data = getTelemetry();
    expect(data.humanCommits).toBe(1);
    expect(data.linesByHuman).toBe(15);
  });

  it('logTelemetry should accumulate across calls', async () => {
    const { initTelemetry, logTelemetry, getTelemetry } = await import('../cli/telemetry');
    initTelemetry();
    logTelemetry(true, 10);
    logTelemetry(true, 20);
    logTelemetry(false, 5);
    const data = getTelemetry();
    expect(data.aiCommits).toBe(2);
    expect(data.linesByAi).toBe(30);
    expect(data.humanCommits).toBe(1);
    expect(data.linesByHuman).toBe(5);
  });
});
