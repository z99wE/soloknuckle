import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ─── Flaky Test Detector ───────────────────────────────────────────────────
// Detects intermittent test failures (Flaky Test Explosion)
// This addresses the critical gap where $360K/month is spent maintaining 500 flaky tests

export interface FlakyTest {
  name: string;
  file: string;
  line?: number;
  runCount: number;
  passCount: number;
  failCount: number;
  flakyScore: number;
  lastFailure?: string;
  failureReasons: string[];
}

export interface FlakyDetectionResult {
  score: number;
  flakyTests: FlakyTest[];
  summary: {
    totalTests: number;
    flakyTests: number;
    stableTests: number;
    averageFlakyScore: number;
    estimatedMaintenanceCost: number;
  };
}

// ─── Flaky Test Detection Patterns ─────────────────────────────────────────

const FLAKY_PATTERNS = [
  // Timing issues
  /setTimeout\s*\(/g,
  /setInterval\s*\(/g,
  /\.then\s*\(/g,
  /await\s+/g,

  // Async issues
  /Promise\s*\(/g,
  /new\s+Promise\s*\(/g,
  /async\s+/g,

  // Network issues
  /fetch\s*\(/g,
  /axios\s*\(/g,
  /request\s*\(/g,
  /got\s*\(/g,

  // Database issues
  /\.save\s*\(/g,
  /\.create\s*\(/g,
  /\.update\s*\(/g,
  /\.delete\s*\(/g,
  /\.find\s*\(/g,
  /\.findOne\s*\(/g,

  // File system issues
  /fs\.\w+File\s*\(/g,
  /fs\.\w+Dir\s*\(/g,
  /fs\.\w+Sync\s*\(/g,

  // Random values
  /Math\.random\s*\(/g,
  /Date\.now\s*\(/g,
  /new\s+Date\s*\(/g,

  // External service calls
  /http\.get\s*\(/g,
  /http\.post\s*\(/g,
  /https\.get\s*\(/g,
  /https\.post\s*\(/g,
];

// ─── Test History Analysis ─────────────────────────────────────────────────

interface TestRun {
  timestamp: number;
  passed: boolean;
  duration: number;
  error?: string;
}

function analyzeTestHistory(testName: string, runs: TestRun[]): FlakyTest {
  const passCount = runs.filter(r => r.passed).length;
  const failCount = runs.filter(r => !r.passed).length;
  const runCount = runs.length;

  // Calculate flaky score (0-100, higher = more flaky)
  let flakyScore = 0;

  if (runCount > 1) {
    // Flakiness is highest when pass/fail ratio is close to 50/50
    const passRate = passCount / runCount;
    const flakiness = 1 - Math.abs(passRate - 0.5) * 2;
    flakyScore = Math.round(flakiness * 100);

    // Reduce score if test is consistently passing or failing
    if (passRate === 1) flakyScore = 0; // Always passes
    if (passRate === 0) flakyScore = 0; // Always fails (not flaky, just broken)
  }

  // Extract failure reasons
  const failureReasons = runs
    .filter(r => !r.passed && r.error)
    .map(r => r.error!)
    .filter((error, index, self) => self.indexOf(error) === index)
    .slice(0, 5);

  return {
    name: testName,
    file: '',
    runCount,
    passCount,
    failCount,
    flakyScore,
    lastFailure: runs.find(r => !r.passed)?.error,
    failureReasons,
  };
}

// ─── Test File Pattern Analysis ────────────────────────────────────────────

function analyzeTestFilePatterns(filePath: string, content: string): { score: number; patterns: string[] } {
  let flakyIndicators = 0;
  const detectedPatterns: string[] = [];

  // Check for flaky patterns
  for (const pattern of FLAKY_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      flakyIndicators += matches.length;
      detectedPatterns.push(pattern.source);
    }
  }

  // Calculate score based on patterns
  const score = Math.max(0, 100 - (flakyIndicators * 5));

  return {
    score,
    patterns: detectedPatterns,
  };
}

// ─── Main Flaky Test Detection ─────────────────────────────────────────────

export async function detectFlakyTests(
  testFiles: string[] = [],
  runCount: number = 3
): Promise<FlakyDetectionResult> {
  const allFlakyTests: FlakyTest[] = [];
  let totalTests = 0;

  // Find test files if not provided
  if (testFiles.length === 0) {
    testFiles = findTestFiles();
  }

  // Analyze each test file for flaky patterns
  for (const file of testFiles) {
    try {
      const fullPath = path.join(process.cwd(), file);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const analysis = analyzeTestFilePatterns(file, content);

      // If file has flaky patterns, add it to flaky tests
      if (analysis.score < 70) {
        allFlakyTests.push({
          name: path.basename(file),
          file,
          runCount: 0,
          passCount: 0,
          failCount: 0,
          flakyScore: 100 - analysis.score,
          failureReasons: analysis.patterns,
        });
      }

      totalTests++;
    } catch (err) {
      console.error(`Error analyzing ${file}:`, err);
    }
  }

  // If we have test files and want to run them multiple times to detect flakiness
  if (testFiles.length > 0 && runCount > 1) {
    const testResults = await runTestsMultipleTimes(testFiles, runCount);

    // Analyze results for flakiness
    for (const [testName, runs] of Object.entries(testResults)) {
      const flakyTest = analyzeTestHistory(testName, runs);

      // Only add if it's actually flaky
      if (flakyTest.flakyScore > 0) {
        // Find existing flaky test or create new one
        const existing = allFlakyTests.find(t => t.name === testName);
        if (existing) {
          existing.runCount = flakyTest.runCount;
          existing.passCount = flakyTest.passCount;
          existing.failCount = flakyTest.failCount;
          existing.flakyScore = Math.max(existing.flakyScore, flakyTest.flakyScore);
          existing.failureReasons = [...new Set([...existing.failureReasons, ...flakyTest.failureReasons])];
        } else {
          allFlakyTests.push(flakyTest);
        }
      }
    }
  }

  // Calculate summary
  const stableTests = totalTests - allFlakyTests.length;
  const averageFlakyScore = allFlakyTests.length > 0
    ? Math.round(allFlakyTests.reduce((sum, t) => sum + t.flakyScore, 0) / allFlakyTests.length)
    : 0;

  // Estimate maintenance cost ($100 per flaky test per month)
  const estimatedMaintenanceCost = allFlakyTests.length * 100;

  // Calculate overall score
  const score = totalTests > 0
    ? Math.max(0, 100 - (allFlakyTests.length * 10) - (averageFlakyScore * 0.5))
    : 100;

  return {
    score,
    flakyTests: allFlakyTests,
    summary: {
      totalTests,
      flakyTests: allFlakyTests.length,
      stableTests,
      averageFlakyScore,
      estimatedMaintenanceCost,
    },
  };
}

// ─── Run Tests Multiple Times ──────────────────────────────────────────────

async function runTestsMultipleTimes(
  testFiles: string[],
  runCount: number
): Promise<Record<string, TestRun[]>> {
  const results: Record<string, TestRun[]> = {};

  // This is a simplified implementation
  // In a real scenario, you'd run the actual test suite multiple times
  // and parse the output to extract individual test results

  for (let i = 0; i < runCount; i++) {
    try {
      const output = execSync('npm test', {
        encoding: 'utf-8',
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 60000,
      });

      // Parse output to extract test results (simplified)
      const testResults = parseTestOutput(output);

      for (const [testName, passed] of Object.entries(testResults)) {
        if (!results[testName]) {
          results[testName] = [];
        }

        results[testName].push({
          timestamp: Date.now(),
          passed,
          duration: 0,
        });
      }
    } catch (err) {
      // If test run fails, mark all tests as failed for this run
      for (const file of testFiles) {
        const testName = path.basename(file);
        if (!results[testName]) {
          results[testName] = [];
        }

        results[testName].push({
          timestamp: Date.now(),
          passed: false,
          duration: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return results;
}

// ─── Parse Test Output ─────────────────────────────────────────────────────

function parseTestOutput(output: string): Record<string, boolean> {
  const results: Record<string, boolean> = {};

  // Simple parsing - look for pass/fail indicators
  const lines = output.split('\n');
  for (const line of lines) {
    // Jest output patterns
    const jestPass = line.match(/✓\s+(.+)/);
    const jestFail = line.match(/✗\s+(.+)/);

    // Vitest output patterns
    const vitestPass = line.match(/✓\s+(.+)/);
    const vitestFail = line.match(/✗\s+(.+)/);

    // Mocha output patterns
    const mochaPass = line.match(/\s+pass\s+(.+)/);
    const mochaFail = line.match(/\s+fail\s+(.+)/);

    if (jestPass || vitestPass || mochaPass) {
      const testName = (jestPass || vitestPass || mochaPass)![1].trim();
      results[testName] = true;
    }

    if (jestFail || vitestFail || mochaFail) {
      const testName = (jestFail || vitestFail || mochaFail)![1].trim();
      results[testName] = false;
    }
  }

  return results;
}

// ─── Helper to Find Test Files ─────────────────────────────────────────────

function findTestFiles(): string[] {
  const patterns = [
    '**/*.test.ts',
    '**/*.test.js',
    '**/*.spec.ts',
    '**/*.spec.js',
    '**/__tests__/**/*.ts',
    '**/__tests__/**/*.js',
    'test/**/*.ts',
    'test/**/*.js',
    'tests/**/*.ts',
    'tests/**/*.js',
  ];

  const files: string[] = [];

  for (const pattern of patterns) {
    try {
      const [dir, ext] = pattern.split('**/');
      const fullDir = path.join(process.cwd(), dir || '.');

      if (fs.existsSync(fullDir)) {
        const items = fs.readdirSync(fullDir, { recursive: true });
        for (const item of items) {
          const itemPath = path.join(fullDir, String(item));
          if (fs.statSync(itemPath).isFile() && itemPath.endsWith(ext)) {
            files.push(path.relative(process.cwd(), itemPath));
          }
        }
      }
    } catch (err) {
      // Ignore errors
    }
  }

  return [...new Set(files)];
}

// ─── Gate Evaluation ───────────────────────────────────────────────────────

export interface FlakyGateResult {
  passed: boolean;
  score: number;
  threshold: number;
  flakyCount: number;
  estimatedCost: number;
  details: string;
}

export function evaluateFlakyGate(
  detectionResult: FlakyDetectionResult,
  threshold: number = 70
): FlakyGateResult {
  const passed = detectionResult.score >= threshold;

  return {
    passed,
    score: detectionResult.score,
    threshold,
    flakyCount: detectionResult.summary.flakyTests,
    estimatedCost: detectionResult.summary.estimatedMaintenanceCost,
    details: passed
      ? `Flaky test detection passed: ${detectionResult.score}% tests are stable`
      : `Flaky test detection failed: ${detectionResult.score}% tests are stable (${detectionResult.summary.flakyTests} flaky tests, ~$${detectionResult.summary.estimatedMaintenanceCost}/month maintenance)`,
  };
}
