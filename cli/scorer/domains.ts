import fs from 'fs';
import path from 'path';
import { callLLM } from '../llm-client';
import { getErrorMessage, domainStatus, avg } from './helpers';
import type { ScoreMetrics, HygieneDimension } from './types';
import { DEFAULT_WEIGHTS, WEIGHTS_FILE } from './types';
import { getQualityScore, getTestingScore, getSecurityScore, getEfficiencyScore, getAccessibilityScore, getDependencyScore, getDocumentationScore, getGitHygieneScore, getCIPipelineScore, getFeatureFlagsScore, getPerformanceScore, getReliabilityScore, getSupplyChainScore } from './dimensions';
import type { DimensionScore, DomainScorecard, SevenDomainScorecard } from './types';

export function loadWeights(): Record<HygieneDimension, number> {
  const weightsPath = path.join(process.cwd(), WEIGHTS_FILE);
  if (fs.existsSync(weightsPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(weightsPath, 'utf-8'));
      const merged = { ...DEFAULT_WEIGHTS };
      for (const key of Object.keys(DEFAULT_WEIGHTS) as HygieneDimension[]) {
        if (typeof raw[key] === 'number' && raw[key] >= 0) {
          merged[key] = raw[key];
        }
      }
      return merged;
    } catch {
      return { ...DEFAULT_WEIGHTS };
    }
  }
  return { ...DEFAULT_WEIGHTS };
}

export function calculateSevenDomainScorecard(metrics: ScoreMetrics): SevenDomainScorecard {
  const domains: DomainScorecard[] = [
    {
      name: 'Code Quality',
      score: avg([metrics.quality.score, metrics.efficiency.score]),
      dimensions: [
        { name: 'Quality', score: metrics.quality.score },
        { name: 'Efficiency', score: metrics.efficiency.score },
      ],
      status: domainStatus(avg([metrics.quality.score, metrics.efficiency.score])),
    },
    {
      name: 'Testing',
      score: metrics.testing.score,
      dimensions: [{ name: 'Testing', score: metrics.testing.score }],
      status: domainStatus(metrics.testing.score),
    },
    {
      name: 'Security & Compliance',
      score: avg([metrics.security.score, metrics.accessibility.score]),
      dimensions: [
        { name: 'Security', score: metrics.security.score },
        { name: 'Accessibility', score: metrics.accessibility.score },
      ],
      status: domainStatus(avg([metrics.security.score, metrics.accessibility.score])),
    },
    {
      name: 'Performance',
      score: metrics.performance.score,
      dimensions: [{ name: 'Performance', score: metrics.performance.score }],
      status: domainStatus(metrics.performance.score),
    },
    {
      name: 'Reliability',
      score: metrics.reliability.score,
      dimensions: [{ name: 'Reliability', score: metrics.reliability.score }],
      status: domainStatus(metrics.reliability.score),
    },
    {
      name: 'Dependencies & Supply Chain',
      score: avg([metrics.dependencies.score, metrics.supplyChain.score]),
      dimensions: [
        { name: 'Dependencies', score: metrics.dependencies.score },
        { name: 'Supply Chain', score: metrics.supplyChain.score },
      ],
      status: domainStatus(avg([metrics.dependencies.score, metrics.supplyChain.score])),
    },
    {
      name: 'Documentation & Visibility',
      score: avg([metrics.documentation.score, metrics.gitHygiene.score, metrics.ciPipeline.score, metrics.featureFlags.score]),
      dimensions: [
        { name: 'Documentation', score: metrics.documentation.score },
        { name: 'Git Hygiene', score: metrics.gitHygiene.score },
        { name: 'CI/CD Pipeline', score: metrics.ciPipeline.score },
        { name: 'Feature Flags', score: metrics.featureFlags.score },
      ],
      status: domainStatus(avg([metrics.documentation.score, metrics.gitHygiene.score, metrics.ciPipeline.score, metrics.featureFlags.score])),
    },
  ];

  const overallScore = Math.round(domains.reduce((s, d) => s + d.score, 0) / domains.length);

  return {
    domains,
    overallScore,
    overallStatus: domainStatus(overallScore),
  };
}

// ─── Hard Gate Helpers ──────────────────────────────────────────────────────

export interface GateResult {
  passed: boolean;
  gates: { name: string; passed: boolean; score: number; threshold: number }[];
}

export function evaluateHardGates(metrics: ScoreMetrics): GateResult {
  const gates = [
    { name: 'security', passed: metrics.security.score >= 70, score: metrics.security.score, threshold: 70 },
    { name: 'testing', passed: metrics.testing.score >= 70, score: metrics.testing.score, threshold: 70 },
    { name: 'reliability', passed: metrics.reliability.score >= 60, score: metrics.reliability.score, threshold: 60 },
    { name: 'supplyChain', passed: metrics.supplyChain.score >= 50, score: metrics.supplyChain.score, threshold: 50 },
  ];

  return {
    passed: gates.every(g => g.passed),
    gates,
  };
}

// ─── Unified Score Calculation ──────────────────────────────────────────────

export function calculateMetrics(): ScoreMetrics {
  const quality = getQualityScore();
  const testing = getTestingScore();
  const security = getSecurityScore();
  const efficiency = getEfficiencyScore();
  const accessibility = getAccessibilityScore();
  const dependencies = getDependencyScore();
  const documentation = getDocumentationScore();
  const gitHygiene = getGitHygieneScore();
  const ciPipeline = getCIPipelineScore();
  const featureFlags = getFeatureFlagsScore();
  const performance = getPerformanceScore();
  const reliability = getReliabilityScore();
  const supplyChain = getSupplyChainScore();

  const weights = loadWeights();

  const dims: Record<HygieneDimension, DimensionScore> = {
    quality, testing, security, efficiency, accessibility,
    dependencies, documentation, gitHygiene, ciPipeline, featureFlags,
    performance, reliability, supplyChain,
  };

  let totalWeight = 0;
  let weightedSum = 0;
  for (const key of Object.keys(weights) as HygieneDimension[]) {
    weightedSum += dims[key].score * weights[key];
    totalWeight += weights[key];
  }

  const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return {
    quality, testing, security, efficiency, accessibility,
    dependencies, documentation, gitHygiene, ciPipeline, featureFlags,
    performance, reliability, supplyChain,
    overall,
    weights,
  };
}

export async function generateSuggestions(metrics: ScoreMetrics): Promise<string[]> {
  const systemPrompt = `You are a Principal Software Architect. You are analyzing the Unified Hygiene Score of a codebase. The scores are out of 100.
Review the provided metrics and raw output logs for all 10 dimensions: Quality, Testing, Security, Efficiency, Accessibility, Dependencies, Documentation, Git Hygiene, CI Pipeline, and Feature Flags.
Provide EXACTLY 3-5 highly actionable, plain-English suggestions to improve the lowest scoring areas.
Return the suggestions as a JSON array of strings ONLY. No markdown, no introduction. Just the raw JSON array.
Example: ["Add 'aria-label' to the buttons in App.jsx.", "Fix the invalid hook call on line 34 in App.jsx to pass tests."]`;

  const userPrompt = JSON.stringify(metrics, null, 2);

  try {
    const rawReply = await callLLM(systemPrompt, userPrompt);
    let parsed: string[];
    try {
      const cleaned = rawReply.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('Not an array');
    } catch {
      parsed = [rawReply];
    }
    return parsed;
  } catch (e: unknown) {
    return [`Failed to generate AI suggestions: ${getErrorMessage(e)}`];
  }
}
