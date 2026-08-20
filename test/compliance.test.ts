import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runCompliance, printComplianceReport } from '../cli/compliance';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-compliance');

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

vi.mock('../cli/scorer', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../cli/scorer')>();
  return {
    ...orig,
    calculateMetrics: vi.fn(() => ({
      quality: { score: 90, rawOutput: '' },
      testing: { score: 100, rawOutput: '' },
      security: { score: 100, rawOutput: '' },
      efficiency: { score: 90, rawOutput: '' },
      accessibility: { score: 80, rawOutput: '' },
      dependencies: { score: 85, rawOutput: '' },
      documentation: { score: 90, rawOutput: '' },
      gitHygiene: { score: 85, rawOutput: '' },
      ciPipeline: { score: 90, rawOutput: '' },
      featureFlags: { score: 80, rawOutput: '' },
      performance: { score: 95, rawOutput: '' },
      reliability: { score: 90, rawOutput: '' },
      supplyChain: { score: 85, rawOutput: '' },
      overall: 90,
    })),
  };
});

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('runCompliance', () => {
  it('returns a valid compliance report', () => {
    const report = runCompliance();
    expect(report.projectName).toBeTruthy();
    expect(report.timestamp).toBeTruthy();
    expect(typeof report.overallScore).toBe('number');
    expect(Array.isArray(report.checks)).toBe(true);
    expect(typeof report.passed).toBe('boolean');
  });

  it('runs all 10 compliance checks', () => {
    const report = runCompliance();
    expect(report.checks).toHaveLength(10);
  });

  it('checks for hardcoded secrets', () => {
    const report = runCompliance();
    const secretCheck = report.checks.find(c => c.name === 'No hardcoded secrets');
    expect(secretCheck).toBeDefined();
    expect(secretCheck?.passed).toBe(true);
    expect(secretCheck?.severity).toBe('critical');
  });

  it('fails when hardcoded secrets exist', () => {
    fs.mkdirSync(path.join(TEST_DIR, 'src'), { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'src', 'config.ts'), 'const apiKey = "TEST_API_KEY_abc123def456ghi789";');
    const report = runCompliance();
    const secretCheck = report.checks.find(c => c.name === 'No hardcoded secrets');
    expect(secretCheck?.passed).toBe(false);
  });

  it('checks .env in .gitignore', () => {
    fs.writeFileSync(path.join(TEST_DIR, '.gitignore'), 'node_modules\n.env\n');
    const report = runCompliance();
    const envCheck = report.checks.find(c => c.name === '.env excluded from git');
    expect(envCheck?.passed).toBe(true);
  });

  it('fails when .env not in .gitignore', () => {
    const report = runCompliance();
    const envCheck = report.checks.find(c => c.name === '.env excluded from git');
    expect(envCheck?.passed).toBe(false);
  });

  it('checks for eval() usage', () => {
    const report = runCompliance();
    const evalCheck = report.checks.find(c => c.name === 'No eval() usage');
    expect(evalCheck?.passed).toBe(true);
  });

  it('fails when eval() is present', () => {
    fs.mkdirSync(path.join(TEST_DIR, 'src'), { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'src', 'bad.ts'), 'eval("alert(1)");');
    const report = runCompliance();
    const evalCheck = report.checks.find(c => c.name === 'No eval() usage');
    expect(evalCheck?.passed).toBe(false);
  });

  it('checks for lock file', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'package-lock.json'), '{}');
    const report = runCompliance();
    const lockCheck = report.checks.find(c => c.name === 'Lock file present');
    expect(lockCheck?.passed).toBe(true);
  });

  it('fails without lock file', () => {
    const report = runCompliance();
    const lockCheck = report.checks.find(c => c.name === 'Lock file present');
    expect(lockCheck?.passed).toBe(false);
  });

  it('checks for README.md', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'README.md'), '# Test');
    const report = runCompliance();
    const readmeCheck = report.checks.find(c => c.name === 'README.md present');
    expect(readmeCheck?.passed).toBe(true);
  });

  it('checks for CI pipeline', () => {
    fs.mkdirSync(path.join(TEST_DIR, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, '.github', 'workflows', 'ci.yml'), 'name: CI');
    const report = runCompliance();
    const ciCheck = report.checks.find(c => c.name === 'CI/CD pipeline');
    expect(ciCheck?.passed).toBe(true);
  });

  it('passes when all critical checks pass', () => {
    fs.writeFileSync(path.join(TEST_DIR, '.gitignore'), '.env\n');
    fs.writeFileSync(path.join(TEST_DIR, 'package-lock.json'), '{}');
    const report = runCompliance();
    expect(report.passed).toBe(true);
  });

  it('fails when critical check fails', () => {
    fs.mkdirSync(path.join(TEST_DIR, 'src'), { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'src', 'bad.ts'), 'eval("alert(1)");');
    const report = runCompliance();
    expect(report.passed).toBe(false);
  });
});

describe('printComplianceReport', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('prints header and project name', () => {
    const report = runCompliance();
    printComplianceReport(report);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Self-Compliance Audit');
    expect(output).toContain(report.projectName);
  });

  it('prints pass count', () => {
    const report = runCompliance();
    printComplianceReport(report);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('passed');
  });

  it('prints compliant message when all critical checks pass', () => {
    fs.writeFileSync(path.join(TEST_DIR, '.gitignore'), '.env\n');
    fs.writeFileSync(path.join(TEST_DIR, 'package-lock.json'), '{}');
    const report = runCompliance();
    printComplianceReport(report);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('compliant');
  });

  it('prints not compliant message when critical checks fail', () => {
    fs.mkdirSync(path.join(TEST_DIR, 'src'), { recursive: true });
    fs.writeFileSync(path.join(TEST_DIR, 'src', 'bad.ts'), 'eval("alert(1)");');
    const report = runCompliance();
    printComplianceReport(report);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('not compliant');
  });
});
