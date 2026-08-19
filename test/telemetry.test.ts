import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('telemetry', () => {
  let originalCwd: string;
  let tmpDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soloknuckle-telemetry-'));
    process.chdir(tmpDir);
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function importTelemetry() {
    const mod = await import('../cli/telemetry');
    return mod;
  }

  it('should initialize telemetry file with zeros', async () => {
    const { initTelemetry } = await importTelemetry();
    initTelemetry();
    const file = path.join(tmpDir, '.soloknuckle', 'telemetry.json');
    expect(fs.existsSync(file)).toBe(true);
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(data).toEqual({
      humanCommits: 0,
      aiCommits: 0,
      linesByHuman: 0,
      linesByAi: 0,
    });
  });

  it('should not overwrite existing telemetry file on re-init', async () => {
    const { initTelemetry, logTelemetry } = await importTelemetry();
    initTelemetry();
    logTelemetry(true, 10);
    initTelemetry();
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, '.soloknuckle', 'telemetry.json'), 'utf-8'));
    expect(data.aiCommits).toBe(1);
    expect(data.linesByAi).toBe(10);
  });

  it('should log AI commits', async () => {
    const { logTelemetry } = await importTelemetry();
    const data = logTelemetry(true, 42);
    expect(data.aiCommits).toBe(1);
    expect(data.linesByAi).toBe(42);
    expect(data.humanCommits).toBe(0);
    expect(data.linesByHuman).toBe(0);
  });

  it('should log human commits', async () => {
    const { logTelemetry } = await importTelemetry();
    const data = logTelemetry(false, 15);
    expect(data.humanCommits).toBe(1);
    expect(data.linesByHuman).toBe(15);
    expect(data.aiCommits).toBe(0);
    expect(data.linesByAi).toBe(0);
  });

  it('should accumulate telemetry across multiple calls', async () => {
    const { logTelemetry } = await importTelemetry();
    logTelemetry(true, 10);
    logTelemetry(true, 20);
    logTelemetry(false, 5);
    const data = logTelemetry(false, 3);
    expect(data.aiCommits).toBe(2);
    expect(data.linesByAi).toBe(30);
    expect(data.humanCommits).toBe(2);
    expect(data.linesByHuman).toBe(8);
  });

  it('should recover from malformed telemetry JSON', async () => {
    const { logTelemetry } = await importTelemetry();
    const dir = path.join(tmpDir, '.soloknuckle');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'telemetry.json'), 'NOT JSON');
    const data = logTelemetry(true, 5);
    expect(data.aiCommits).toBe(1);
    expect(data.linesByAi).toBe(5);
  });

  it('should return telemetry data via getTelemetry', async () => {
    const { logTelemetry, getTelemetry } = await importTelemetry();
    logTelemetry(true, 100);
    logTelemetry(false, 50);
    const data = getTelemetry();
    expect(data.aiCommits).toBe(1);
    expect(data.linesByAi).toBe(100);
    expect(data.humanCommits).toBe(1);
    expect(data.linesByHuman).toBe(50);
  });
});
