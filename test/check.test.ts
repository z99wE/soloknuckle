import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runCheck } from '../cli/check';

vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('git rev-parse')) throw new Error('not a git repo');
    if (cmd.includes('git diff')) return '';
    if (cmd.includes('npm audit')) return '{}';
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
}));

vi.mock('../cli/scanner', () => ({
  scanDiffForSecretsAndPII: vi.fn(() => []),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    writeFileSync: vi.fn(),
  };
});

describe('check command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should run check and print header', async () => {
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Soloknuckle');
    expect(output).toContain('Production Readiness Check');
  });

  it('should show score summary', async () => {
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('100/100');
    expect(output).toContain('Production-ready');
  });

  it('should show all check sections', async () => {
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
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No issues found');
    expect(output).toContain('All clear');
  });

  it('should show issues when scores are low', async () => {
    const { getSecurityScore, getTestingScore } = await import('../cli/scorer');
    (getSecurityScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 30 });
    (getTestingScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 40 });
    
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('BLOCKER');
    expect(output).toContain('Fix this');
  });

  it('should exit with code 1 when critical issues exist', async () => {
    const { getSecurityScore } = await import('../cli/scorer');
    (getSecurityScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 30 });
    
    await runCheck();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should show progress bar', async () => {
    await runCheck();
    const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('\u{2588}');
  });
});
