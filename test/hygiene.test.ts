import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-hygiene');

describe('Solo Dev Production Checklist', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('runHygieneCheck', () => {
    it('returns a valid report with all checks', async () => {
      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('overallScore');
      expect(report).toHaveProperty('grade');
      expect(report).toHaveProperty('checks');
      expect(report).toHaveProperty('passed');
      expect(report.checks).toHaveLength(8);
    });

    it('grades report correctly', async () => {
      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(report.grade);
    });

    it('includes Secrets & PII check', async () => {
      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const secretsCheck = report.checks.find(c => c.name === 'Secrets & PII');
      expect(secretsCheck).toBeDefined();
      expect(secretsCheck?.score).toBeGreaterThanOrEqual(0);
      expect(secretsCheck?.score).toBeLessThanOrEqual(100);
    });

    it('includes Agent Guardrails check', async () => {
      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const guardrailsCheck = report.checks.find(c => c.name === 'Agent Guardrails');
      expect(guardrailsCheck).toBeDefined();
    });

    it('warns when no guardrails present', async () => {
      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const guardrailsCheck = report.checks.find(c => c.name === 'Agent Guardrails');
      expect(guardrailsCheck?.status).toBe('fail');
    });

    it('passes guardrails when multiple guardrail files exist', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'AGENTS.md'), '# AGENTS.md');
      fs.writeFileSync(path.join(TEST_DIR, '.cursorrules'), '# Rules');
      fs.writeFileSync(path.join(TEST_DIR, 'SKILL.md'), '# Skills');

      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const guardrailsCheck = report.checks.find(c => c.name === 'Agent Guardrails');
      expect(guardrailsCheck?.status).toBe('pass');
      expect(guardrailsCheck?.message).toContain('AGENTS.md');
    });

    it('warns when only one guardrail file exists', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'AGENTS.md'), '# AGENTS.md');

      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const guardrailsCheck = report.checks.find(c => c.name === 'Agent Guardrails');
      expect(guardrailsCheck?.status).toBe('warn');
      expect(guardrailsCheck?.message).toContain('AGENTS.md');
    });

    it('skips telemetry when not initialized', async () => {
      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const telemetryCheck = report.checks.find(c => c.name === 'AI Telemetry');
      expect(telemetryCheck?.status).toBe('skip');
    });

    it('checks feature flags', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'flags.json'), JSON.stringify({
        'export-csv': true,
        'dark-mode': false,
      }, null, 2));

      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const flagsCheck = report.checks.find(c => c.name === 'Feature Flags');
      expect(flagsCheck?.status).toBe('pass');
      expect(flagsCheck?.message).toContain('2');
    });

    it('warns when no flags.json exists', async () => {
      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const flagsCheck = report.checks.find(c => c.name === 'Feature Flags');
      expect(flagsCheck?.status).toBe('warn');
      expect(flagsCheck?.message).toContain('No flags.json');
    });

    it('checks dependencies for lock file', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), '{}');

      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const depsCheck = report.checks.find(c => c.name === 'Dependencies');
      expect(depsCheck?.status).toBe('warn');
      expect(depsCheck?.message).toContain('No lock file');
    });

    it('passes dependencies when lock file exists', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), '{}');
      fs.writeFileSync(path.join(TEST_DIR, 'package-lock.json'), '{}');

      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const depsCheck = report.checks.find(c => c.name === 'Dependencies');
      expect(['pass', 'warn']).toContain(depsCheck?.status);
      expect(depsCheck?.message).toMatch(/No known vulnerabilities|Could not run npm audit/);
    });

    it('checks deployment CI/CD', async () => {
      fs.mkdirSync(path.join(TEST_DIR, '.github', 'workflows'), { recursive: true });
      fs.writeFileSync(path.join(TEST_DIR, '.github', 'workflows', 'ci.yml'), 'name: CI');

      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const deployCheck = report.checks.find(c => c.name === 'Deployment');
      expect(deployCheck?.status).toBe('pass');
      expect(deployCheck?.message).toContain('CI/CD detected');
    });

    it('warns when no CI/CD pipeline found', async () => {
      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const deployCheck = report.checks.find(c => c.name === 'Deployment');
      expect(deployCheck?.status).toBe('warn');
      expect(deployCheck?.message).toContain('No CI/CD pipeline found');
    });

    it('checks accessibility', async () => {
      fs.mkdirSync(path.join(TEST_DIR, 'ui', 'src'), { recursive: true });
      fs.writeFileSync(path.join(TEST_DIR, 'ui', 'src', 'App.jsx'), '<img src="logo.png" alt="Logo" />\n');

      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const a11yCheck = report.checks.find(c => c.name === 'Accessibility');
      expect(a11yCheck?.status).toBe('pass');
      expect(a11yCheck?.message).toContain('No obvious a11y violations');
    });

    it('warns when accessibility issues found', async () => {
      fs.mkdirSync(path.join(TEST_DIR, 'ui', 'src'), { recursive: true });
      fs.writeFileSync(path.join(TEST_DIR, 'ui', 'src', 'App.jsx'),
        '<img src="a.png" />\n<img src="b.png" />\n');

      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const a11yCheck = report.checks.find(c => c.name === 'Accessibility');
      expect(a11yCheck?.status).toBe('warn');
      expect(a11yCheck?.message).toContain('2 accessibility issue(s)');
    });

    it('checks quality/lint', async () => {
      fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
        scripts: { lint: 'eslint .' }
      }, null, 2));

      const { runHygieneCheck } = await import('../cli/hygiene');
      const report = runHygieneCheck();

      const qualityCheck = report.checks.find(c => c.name === 'Code Quality');
      expect(qualityCheck).toBeDefined();
    });
  });

  describe('formatHygieneReport', () => {
    it('returns formatted string', async () => {
      const { runHygieneCheck, formatHygieneReport } = await import('../cli/hygiene');
      const report = runHygieneCheck();
      const formatted = formatHygieneReport(report);

      expect(formatted).toContain('SOLOKNUCKLE HYGIENE REPORT');
      expect(formatted).toContain(`${report.overallScore}/100`);
      expect(formatted).toContain(`Grade: ${report.grade}`);
    });
  });
});
