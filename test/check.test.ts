import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-check');

vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('git rev-parse')) throw new Error('not a git repo');
    if (cmd.includes('git diff')) return '';
    if (cmd.includes('npm audit')) return '{}';
    if (cmd.includes('npm run lint')) return '';
    return '';
  }),
}));

vi.mock('../cli/scorer', () => ({
  getSecurityScore: vi.fn(() => ({ score: 100 })),
  getTestingScore: vi.fn(() => ({ score: 100 })),
  getQualityScore: vi.fn(() => ({ score: 100 })),
  getDependencyScore: vi.fn(() => ({ score: 100 })),
  getAccessibilityScore: vi.fn(() => ({ score: 100 })),
  getDocumentationScore: vi.fn(() => ({ score: 100 })),
  getGitHygieneScore: vi.fn(() => ({ score: 100 })),
  getCIPipelineScore: vi.fn(() => ({ score: 100 })),
  getFeatureFlagsScore: vi.fn(() => ({ score: 100 })),
  getEfficiencyScore: vi.fn(() => ({ score: 100 })),
  getPerformanceScore: vi.fn(() => ({ score: 100 })),
  getReliabilityScore: vi.fn(() => ({ score: 100 })),
  getSupplyChainScore: vi.fn(() => ({ score: 100 })),
  calculateMetrics: vi.fn(() => ({
    overall: 100,
    quality: { score: 100, weight: 0.15 },
    testing: { score: 100, weight: 0.15 },
    security: { score: 100, weight: 0.15 },
    efficiency: { score: 100, weight: 0.1 },
    accessibility: { score: 100, weight: 0.1 },
    performance: { score: 100, weight: 0.1 },
    reliability: { score: 100, weight: 0.1 },
    supplyChain: { score: 100, weight: 0.15 },
  })),
}));

vi.mock('../cli/scanner', () => ({
  scanDiffForSecretsAndPII: vi.fn(() => []),
}));

vi.mock('../cli/gates', () => ({
  evaluateGates: vi.fn(() => ({
    scorecard: {
      codeQuality: { score: 100, dimensions: ['quality'], status: 'healthy' },
      testing: { score: 100, dimensions: ['testing'], status: 'healthy' },
      securityCompliance: { score: 100, dimensions: ['security'], status: 'healthy' },
      performance: { score: 100, dimensions: ['performance'], status: 'healthy' },
      reliability: { score: 100, dimensions: ['reliability'], status: 'healthy' },
      dependencies: { score: 100, dimensions: ['dependencies', 'supplyChain'], status: 'healthy' },
      docsVisibility: { score: 100, dimensions: ['docs', 'ci', 'featureFlags'], status: 'healthy' },
    },
    gateResult: { passed: true, failures: [] },
  })),
  printGateReport: vi.fn(),
  printSevenDomainScorecard: vi.fn(),
}));

describe('check command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    fs.mkdirSync(TEST_DIR, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
    vi.resetModules();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  function cleanTestDir() {
    const files = ['.gitignore', 'README.md', 'flags.json'];
    for (const f of files) {
      const p = path.join(TEST_DIR, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    const ciDir = path.join(TEST_DIR, '.github');
    if (fs.existsSync(ciDir)) fs.rmSync(ciDir, { recursive: true, force: true });
  }

  it('should run check and print header', async () => {
    const { runCheck } = await import('../cli/check');
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Soloknuckle');
    expect(output).toContain('Production Readiness Check');
  });

  it('should show score summary', async () => {
    const { runCheck } = await import('../cli/check');
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('100/100');
    expect(output).toContain('Production-ready');
  });

  it('should show all check sections', async () => {
    const { runCheck } = await import('../cli/check');
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Security');
    expect(output).toContain('Testing');
    expect(output).toContain('Code Quality');
    expect(output).toContain('Dependencies');
    expect(output).toContain('Accessibility');
    expect(output).toContain('Documentation');
    expect(output).toContain('Git Hygiene');
    expect(output).toContain('CI/CD Pipeline');
    expect(output).toContain('Feature Flags');
  });

  it('should show no issues when all scores are high', async () => {
    const { runCheck } = await import('../cli/check');
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No issues found');
    expect(output).toContain('All clear');
  });

  it('should show issues when scores are low', async () => {
    const { getSecurityScore, getTestingScore } = await import('../cli/scorer');
    (getSecurityScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 30 });
    (getTestingScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 40 });

    const { runCheck } = await import('../cli/check');
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('BLOCKER');
    expect(output).toContain('Fix this');
  });

  it('should exit with code 1 when critical issues exist', async () => {
    const { getSecurityScore } = await import('../cli/scorer');
    (getSecurityScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 30 });

    const { runCheck } = await import('../cli/check');
    await runCheck();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should show progress bar', async () => {
    const { runCheck } = await import('../cli/check');
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('\u{2588}');
  });

  it('should trigger attemptFixes when --fix is set and issues exist', async () => {
    const { getDocumentationScore } = await import('../cli/scorer');
    (getDocumentationScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 20 });

    const { runCheck } = await import('../cli/check');
    await runCheck({ fix: true });

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('auto-fixes');
  });

  it('should create README.md when documentation fix is triggered', async () => {
    const { getDocumentationScore } = await import('../cli/scorer');
    (getDocumentationScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 20 });

    const readmePath = path.join(TEST_DIR, 'README.md');
    if (fs.existsSync(readmePath)) fs.unlinkSync(readmePath);

    const { runCheck } = await import('../cli/check');
    await runCheck({ fix: true });

    expect(fs.existsSync(readmePath)).toBe(true);
    const content = fs.readFileSync(readmePath, 'utf-8');
    expect(content).toContain('Getting Started');
  });

  it('should create CI workflow when CI/CD fix is triggered', async () => {
    const { getCIPipelineScore } = await import('../cli/scorer');
    (getCIPipelineScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 20 });

    const ciPath = path.join(TEST_DIR, '.github', 'workflows', 'ci.yml');
    if (fs.existsSync(ciPath)) fs.unlinkSync(ciPath);

    const { runCheck } = await import('../cli/check');
    await runCheck({ fix: true });

    expect(fs.existsSync(ciPath)).toBe(true);
    const content = fs.readFileSync(ciPath, 'utf-8');
    expect(content).toContain('npm ci');
  });

  it('should create flags.json when feature flags fix is triggered', async () => {
    const { getFeatureFlagsScore } = await import('../cli/scorer');
    (getFeatureFlagsScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 20 });

    const flagsPath = path.join(TEST_DIR, 'flags.json');
    if (fs.existsSync(flagsPath)) fs.unlinkSync(flagsPath);

    const { runCheck } = await import('../cli/check');
    await runCheck({ fix: true });

    expect(fs.existsSync(flagsPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
    expect(content).toHaveProperty('version', 1);
  });

  it('should create .gitignore when security fix is triggered', async () => {
    const { getSecurityScore } = await import('../cli/scorer');
    (getSecurityScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 40 });

    const gitignorePath = path.join(TEST_DIR, '.gitignore');
    if (fs.existsSync(gitignorePath)) fs.unlinkSync(gitignorePath);

    const { runCheck } = await import('../cli/check');
    await runCheck({ fix: true });

    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('.env');
  });

  it('should run lint fix when quality fix is triggered and lint script exists', async () => {
    const { getQualityScore } = await import('../cli/scorer');
    (getQualityScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 50 });

    const pkgPath = path.join(TEST_DIR, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ scripts: { lint: 'eslint .' } }));

    const { runCheck } = await import('../cli/check');
    await runCheck({ fix: true });

    const { execSync } = await import('child_process');
    const execSpy = vi.mocked(execSync);
    expect(execSpy).toHaveBeenCalledWith('npm run lint -- --fix', expect.anything());
  });

  it('should run npm audit fix when dependency fix is triggered', async () => {
    const { getDependencyScore } = await import('../cli/scorer');
    (getDependencyScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 50 });

    const { runCheck } = await import('../cli/check');
    await runCheck({ fix: true });

    const { execSync } = await import('child_process');
    const execSpy = vi.mocked(execSync);
    expect(execSpy).toHaveBeenCalledWith('npm audit fix', expect.anything());
  });

  it('should init git repo when git hygiene fix is triggered', async () => {
    const { getGitHygieneScore } = await import('../cli/scorer');
    (getGitHygieneScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 30 });

    const gitDir = path.join(TEST_DIR, '.git');
    if (fs.existsSync(gitDir)) fs.rmSync(gitDir, { recursive: true });

    const { execSync } = await import('child_process');
    (execSync as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'git init') {
        fs.mkdirSync(gitDir, { recursive: true });
      }
      return Buffer.from('');
    });

    const { runCheck } = await import('../cli/check');
    await runCheck({ fix: true });

    expect(fs.existsSync(gitDir)).toBe(true);
  });

  it('should not run fixes when --fix is not set', async () => {
    const { getDocumentationScore } = await import('../cli/scorer');
    (getDocumentationScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 20 });

    const { runCheck } = await import('../cli/check');
    await runCheck({ fix: false });

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).not.toContain('auto-fixes');
  });

  it('should not run fixes when no issues exist', async () => {
    const scorer = await import('../cli/scorer');
    for (const fn of Object.values(scorer)) {
      if (typeof fn === 'function' && 'mockReturnValue' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReturnValue({ score: 100 });
      }
    }

    const { runCheck } = await import('../cli/check');
    await runCheck({ fix: true });

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).not.toContain('auto-fixes');
  });

  it('should show "no auto-fixes" when no issues have fix actions', async () => {
    cleanTestDir();
    const scorer = await import('../cli/scorer');
    for (const fn of Object.values(scorer)) {
      if (typeof fn === 'function' && 'mockReturnValue' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReturnValue({ score: 100 });
      }
    }

    const { runCheck } = await import('../cli/check');
    consoleSpy.mockReset();
    await runCheck({ fix: true });

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).not.toContain('Attempting auto-fixes');
  });
});
