import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { evaluateGates, printGateReport, printSevenDomainScorecard } from '../cli/gates';
import type { ScoreMetrics } from '../cli/scorer';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-gates');

function makeMetrics(overrides: Partial<Record<string, number>> = {}): ScoreMetrics {
  const defaults: Record<string, { score: number; rawOutput: string }> = {
    quality: { score: 100, rawOutput: '' },
    testing: { score: 100, rawOutput: '' },
    security: { score: 100, rawOutput: '' },
    efficiency: { score: 100, rawOutput: '' },
    accessibility: { score: 100, rawOutput: '' },
    dependencies: { score: 100, rawOutput: '' },
    documentation: { score: 100, rawOutput: '' },
    gitHygiene: { score: 100, rawOutput: '' },
    ciPipeline: { score: 100, rawOutput: '' },
    featureFlags: { score: 100, rawOutput: '' },
    performance: { score: 100, rawOutput: '' },
    reliability: { score: 100, rawOutput: '' },
    supplyChain: { score: 100, rawOutput: '' },
    overall: 100,
  };
  for (const [key, val] of Object.entries(overrides)) {
    if (key === 'overall') {
      defaults.overall = val;
    } else {
      defaults[key] = { score: val, rawOutput: '' };
    }
  }
  return defaults as unknown as ScoreMetrics;
}

describe('evaluateGates', () => {
  it('returns passed: true when all gates pass', () => {
    const metrics = makeMetrics({ security: 100, testing: 100, reliability: 100, supplyChain: 100 });
    const report = evaluateGates(metrics);
    expect(report.gateResult.passed).toBe(true);
    expect(report.gateResult.gates).toHaveLength(4);
  });

  it('returns passed: false when security < 70', () => {
    const metrics = makeMetrics({ security: 50 });
    const report = evaluateGates(metrics);
    expect(report.gateResult.passed).toBe(false);
    const secGate = report.gateResult.gates.find(g => g.name === 'security');
    expect(secGate?.passed).toBe(false);
    expect(secGate?.score).toBe(50);
  });

  it('returns passed: false when testing < 70', () => {
    const metrics = makeMetrics({ testing: 60 });
    const report = evaluateGates(metrics);
    expect(report.gateResult.passed).toBe(false);
    const testGate = report.gateResult.gates.find(g => g.name === 'testing');
    expect(testGate?.passed).toBe(false);
  });

  it('returns passed: false when reliability < 60', () => {
    const metrics = makeMetrics({ reliability: 40 });
    const report = evaluateGates(metrics);
    expect(report.gateResult.passed).toBe(false);
    const relGate = report.gateResult.gates.find(g => g.name === 'reliability');
    expect(relGate?.passed).toBe(false);
  });

  it('returns passed: false when supplyChain < 50', () => {
    const metrics = makeMetrics({ supplyChain: 30 });
    const report = evaluateGates(metrics);
    expect(report.gateResult.passed).toBe(false);
    const scGate = report.gateResult.gates.find(g => g.name === 'supplyChain');
    expect(scGate?.passed).toBe(false);
  });

  it('returns the scorecard with 7 domains', () => {
    const metrics = makeMetrics();
    const report = evaluateGates(metrics);
    expect(report.scorecard.domains).toHaveLength(7);
    expect(report.scorecard.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.scorecard.overallScore).toBeLessThanOrEqual(100);
  });
});

describe('printGateReport', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('prints gate results', () => {
    const metrics = makeMetrics({ security: 80, testing: 80, reliability: 70, supplyChain: 60 });
    const report = evaluateGates(metrics);
    printGateReport(report);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Hard Gate Results');
    expect(output).toContain('security');
    expect(output).toContain('testing');
  });

  it('prints pass message when all gates pass', () => {
    const metrics = makeMetrics();
    const report = evaluateGates(metrics);
    printGateReport(report);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('All gates passed');
  });

  it('prints fail message when gates fail', () => {
    const metrics = makeMetrics({ security: 30 });
    const report = evaluateGates(metrics);
    printGateReport(report);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('not production-ready');
  });
});

describe('printSevenDomainScorecard', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('prints 7-domain scorecard header', () => {
    const metrics = makeMetrics();
    const scorecard = {
      domains: [],
      overallScore: 100,
      overallStatus: 'production-ready' as const,
    };
    // Use evaluateGates to get a proper scorecard
    const report = evaluateGates(metrics);
    printSevenDomainScorecard(report.scorecard);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('7-Domain Scorecard');
  });

  it('prints overall score', () => {
    const metrics = makeMetrics();
    const report = evaluateGates(metrics);
    printSevenDomainScorecard(report.scorecard);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Overall');
    expect(output).toContain('/100');
  });

  it('prints all 7 domain names', () => {
    const metrics = makeMetrics();
    const report = evaluateGates(metrics);
    printSevenDomainScorecard(report.scorecard);
    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Code Quality');
    expect(output).toContain('Testing');
    expect(output).toContain('Security & Compliance');
    expect(output).toContain('Performance');
    expect(output).toContain('Reliability');
    expect(output).toContain('Dependencies & Supply Chain');
    expect(output).toContain('Documentation & Visibility');
  });
});
