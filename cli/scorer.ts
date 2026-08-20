import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { scanDiffForSecretsAndPII } from './scanner';
import { callLLM } from './llm-client';

// ─── Configurable Weights ───────────────────────────────────────────────────

export type HygieneDimension =
  | 'quality' | 'testing' | 'security' | 'efficiency' | 'accessibility'
  | 'dependencies' | 'documentation' | 'gitHygiene' | 'ciPipeline' | 'featureFlags'
  | 'performance' | 'reliability' | 'supplyChain';

export const DEFAULT_WEIGHTS: Record<HygieneDimension, number> = {
  quality: 1,
  testing: 1,
  security: 1,
  efficiency: 1,
  accessibility: 1,
  dependencies: 1,
  documentation: 1,
  gitHygiene: 1,
  ciPipeline: 1,
  featureFlags: 1,
  performance: 1,
  reliability: 1,
  supplyChain: 1,
};

const WEIGHTS_FILE = '.soloknuckle/score-weights.json';

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

// ─── Score Interfaces ───────────────────────────────────────────────────────

export interface DimensionScore {
  score: number;
  rawOutput: string;
}

export interface ScoreMetrics {
  quality: DimensionScore;
  testing: DimensionScore;
  security: DimensionScore;
  efficiency: DimensionScore;
  accessibility: DimensionScore;
  dependencies: DimensionScore;
  documentation: DimensionScore;
  gitHygiene: DimensionScore;
  ciPipeline: DimensionScore;
  featureFlags: DimensionScore;
  performance: DimensionScore;
  reliability: DimensionScore;
  supplyChain: DimensionScore;
  overall: number;
  weights: Record<HygieneDimension, number>;
}

// ─── 7-Domain Scorecard Model ──────────────────────────────────────────────

export type DomainName =
  | 'codeQuality' | 'testing' | 'securityCompliance'
  | 'performance' | 'reliability' | 'dependenciesSupplyChain'
  | 'documentationVisibility';

export interface DomainScorecard {
  name: string;
  score: number;
  dimensions: { name: string; score: number }[];
  status: 'production-ready' | 'almost-there' | 'needs-work' | 'not-ready';
}

export interface SevenDomainScorecard {
  domains: DomainScorecard[];
  overallScore: number;
  overallStatus: 'production-ready' | 'almost-there' | 'needs-work' | 'not-ready';
}

function domainStatus(score: number): DomainScorecard['status'] {
  if (score >= 90) return 'production-ready';
  if (score >= 70) return 'almost-there';
  if (score >= 50) return 'needs-work';
  return 'not-ready';
}

function avg(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function getExecErrorOutput(e: unknown): string {
  if (e && typeof e === 'object' && 'stdout' in e) return (e as { stdout?: string }).stdout || '';
  if (e && typeof e === 'object' && 'stderr' in e) return (e as { stderr?: string }).stderr || '';
  if (e instanceof Error) return e.message;
  return String(e);
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fileExists(p: string): boolean {
  return fs.existsSync(path.join(process.cwd(), p));
}

function dirExists(p: string): boolean {
  const full = path.join(process.cwd(), p);
  return fs.existsSync(full) && fs.statSync(full).isDirectory();
}

// ─── Original 5 Pillars ────────────────────────────────────────────────────

export function getQualityScore(): DimensionScore {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts && pkg.scripts.lint) {
        try {
          execSync('npm run lint', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
          return { score: 100, rawOutput: 'Lint passed' };
        } catch (e: unknown) {
          const output = getExecErrorOutput(e);
          const warningCount = (output.match(/warning/ig) || []).length;
          const errorCount = (output.match(/error/ig) || []).length;
          let score = 100 - (errorCount * 10) - (warningCount * 5);
          if (score < 0) score = 0;
          return { score, rawOutput: output.substring(0, 1000) };
        }
      }
    }
    return { score: 50, rawOutput: 'No lint script found in package.json' };
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing quality: ${getErrorMessage(err)}` };
  }
}

// Cache for test results to avoid re-running tests multiple times per invocation
let _testResultCache: DimensionScore | null = null;
let _testCacheCwd: string = '';

export function getTestingScore(): DimensionScore {
  const cwd = process.cwd();
  if (_testResultCache && _testCacheCwd === cwd) return _testResultCache;
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts && pkg.scripts.test) {
        try {
          const output = execSync('npm run test', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe', timeout: 30000 });
          _testCacheCwd = cwd;
          _testResultCache = { score: 100, rawOutput: output.substring(0, 1000) };
          return _testResultCache;
        } catch (e: unknown) {
          const output = getExecErrorOutput(e);
          const failCount = (output.match(/fail/ig) || []).length;
          let score = 80 - (failCount * 20);
          if (score < 0) score = 0;
          _testCacheCwd = cwd;
          _testResultCache = { score, rawOutput: output.substring(0, 1000) };
          return _testResultCache;
        }
      }
    }
    _testCacheCwd = cwd;
    _testResultCache = { score: 0, rawOutput: 'No test script found in package.json' };
    return _testResultCache;
  } catch (err: unknown) {
    _testCacheCwd = cwd;
    _testResultCache = { score: 0, rawOutput: `Fatal error analyzing tests: ${getErrorMessage(err)}` };
    return _testResultCache;
  }
}

export function getSecurityScore(): DimensionScore {
  try {
    let diff = '';
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: process.cwd() });
      diff = execSync('git diff --cached', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
      if (!diff) diff = execSync('git diff', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
    } catch (_e) {
      // No git repo or no diff available
    }

    const violations = scanDiffForSecretsAndPII(diff);
    if (violations.length === 0) {
      return { score: 100, rawOutput: 'No secrets or PII detected in diff.' };
    } else {
      let score = 100 - (violations.length * 25);
      if (score < 0) score = 0;
      return { score, rawOutput: violations.join('\n') };
    }
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing security: ${getErrorMessage(err)}` };
  }
}

export function getEfficiencyScore(): DimensionScore {
  try {
    let complexityIssues = 0;
    let report = '';

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === 'node_modules' || file === '.git') continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js') || fullPath.endsWith('.jsx') || fullPath.endsWith('.tsx')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n').length;
          const nesting = (content.match(/\{/g) || []).length;

          if (lines > 500) {
            complexityIssues += 2;
            report += `${file} is extremely long (${lines} lines).\n`;
          }
          if (nesting > 150) {
            complexityIssues++;
            report += `${file} has deep nesting.\n`;
          }
        }
      }
    };

    scanDir(path.join(process.cwd(), 'src'));
    scanDir(path.join(process.cwd(), 'cli'));

    if (complexityIssues === 0) return { score: 100, rawOutput: 'Code structure appears highly efficient.' };

    let score = 100 - (complexityIssues * 10);
    if (score < 0) score = 0;
    return { score, rawOutput: report.substring(0, 1000) };
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing efficiency: ${getErrorMessage(err)}` };
  }
}

export function getAccessibilityScore(): DimensionScore {
  try {
    let a11yIssues = 0;
    let report = '';

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === 'node_modules' || file === '.git') continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if (fullPath.endsWith('.html') || fullPath.endsWith('.jsx') || fullPath.endsWith('.tsx')) {
          const content = fs.readFileSync(fullPath, 'utf-8');

          const hasImg = content.match(/<img[^>]*>/g);
          if (hasImg) {
            hasImg.forEach(img => {
              if (!img.includes('alt=')) {
                a11yIssues++;
                report += `Missing alt tag on img in ${file}\n`;
              }
            });
          }

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('<button')) {
              const windowEnd = Math.min(i + 3, lines.length);
              const btnWindow = lines.slice(i, windowEnd).join(' ');
              const hasAriaLabel = btnWindow.includes('aria-label');
              const hasAriaLabelledBy = btnWindow.includes('aria-labelledby');
              const hasTitle = btnWindow.includes('title=');
              if (!hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
                a11yIssues++;
                report += `Button lacks accessible name in ${file}:${i + 1}\n`;
              }
            }
          }
        }
      }
    };

    scanDir(path.join(process.cwd(), 'ui', 'src'));
    scanDir(path.join(process.cwd(), 'src'));

    if (a11yIssues === 0) return { score: 100, rawOutput: 'No obvious accessibility violations found.' };

    let score = 100 - (a11yIssues * 15);
    if (score < 0) score = 0;
    return { score, rawOutput: report.substring(0, 1000) };
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing accessibility: ${getErrorMessage(err)}` };
  }
}

// ─── New 5 Dimensions ──────────────────────────────────────────────────────

export function getDependencyScore(): DimensionScore {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const hasLockFile = lockFiles.some(f => fileExists(f));

    if (!fs.existsSync(pkgPath)) {
      return { score: 50, rawOutput: 'No package.json found.' };
    }

    let score = 100;
    let report = '';

    // Check for lock file
    if (!hasLockFile) {
      score -= 30;
      report += 'No lock file found. Reproducible installs are not guaranteed.\n';
    }

    // Check for known vulnerability patterns in package.json
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depCount = Object.keys(allDeps || {}).length;

      if (depCount > 100) {
        score -= 15;
        report += `High dependency count (${depCount}). Consider auditing for unused deps.\n`;
      } else if (depCount > 50) {
        score -= 5;
        report += `Moderate dependency count (${depCount}).\n`;
      }

      // Check for deprecated / known problematic packages
      const riskyPkgs = ['request', 'moment', 'lodash', 'webpack-dev-server'];
      for (const pkg of riskyPkgs) {
        if (allDeps && allDeps[pkg]) {
          score -= 5;
          report += `'${pkg}' is deprecated or has known issues. Consider replacing it.\n`;
        }
      }
    } catch {
      // skip
    }

    // Try `npm audit` if available
    try {
      const auditOutput = execSync('npm audit --json 2>/dev/null', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe', timeout: 15000 });
      const audit = JSON.parse(auditOutput);
      const vulnCount = audit.metadata?.vulnerabilities?.total || 0;
      const criticalCount = audit.metadata?.vulnerabilities?.critical || 0;
      const highCount = audit.metadata?.vulnerabilities?.high || 0;

      if (criticalCount > 0) {
        score -= 30;
        report += `${criticalCount} critical vulnerabilities found!\n`;
      }
      if (highCount > 0) {
        score -= 15;
        report += `${highCount} high-severity vulnerabilities found.\n`;
      }
      if (vulnCount === 0) {
        report += 'npm audit: no known vulnerabilities.\n';
      } else {
        report += `npm audit: ${vulnCount} total vulnerabilities.\n`;
      }
    } catch {
      // npm audit failed — might not have lock file or network
    }

    if (score < 0) score = 0;
    return { score, rawOutput: report || 'Dependencies look healthy.' };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking dependencies: ${getErrorMessage(err)}` };
  }
}

export function getDocumentationScore(): DimensionScore {
  try {
    let score = 0;
    let report = '';

    const checks: { file: string; points: number; label: string }[] = [
      { file: 'README.md', points: 30, label: 'README' },
      { file: 'LICENSE', points: 20, label: 'LICENSE' },
      { file: 'CHANGELOG.md', points: 15, label: 'CHANGELOG' },
      { file: 'CONTRIBUTING.md', points: 10, label: 'CONTRIBUTING' },
      { file: 'SECURITY.md', points: 10, label: 'SECURITY' },
      { file: 'DISCLAIMER.md', points: 5, label: 'DISCLAIMER' },
    ];

    for (const check of checks) {
      if (fileExists(check.file)) {
        score += check.points;
        // Check if file has meaningful content (not just stub)
        const content = fs.readFileSync(path.join(process.cwd(), check.file), 'utf-8');
        if (content.length > 100) {
          report += `${check.label}: present and detailed.\n`;
        } else {
          score -= Math.floor(check.points / 2);
          report += `${check.label}: present but minimal (< 100 chars).\n`;
        }
      } else {
        report += `${check.label}: missing.\n`;
      }
    }

    // Check for JSDoc/TSDoc in source
    const srcDirs = ['src', 'cli', 'lib'];
    let docBlocks = 0;
    for (const dir of srcDirs) {
      const fullDir = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullDir)) continue;
      const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(fullDir, file), 'utf-8');
        docBlocks += (content.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
      }
    }
    if (docBlocks > 10) {
      score += 10;
      report += `Good inline documentation (${docBlocks} JSDoc blocks).\n`;
    } else if (docBlocks > 0) {
      score += 5;
      report += `Some inline documentation (${docBlocks} JSDoc blocks).\n`;
    }

    if (score > 100) score = 100;
    return { score, rawOutput: report || 'Documentation status unknown.' };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking docs: ${getErrorMessage(err)}` };
  }
}

export function getGitHygieneScore(): DimensionScore {
  try {
    let score = 100;
    let report = '';

    // Check if in a git repo
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: process.cwd() });
    } catch {
      return { score: 30, rawOutput: 'Not a git repository. Git hygiene checks skipped.' };
    }

    // Check for direct commits to main
    try {
      const mainBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: process.cwd() }).trim();
      if (mainBranch === 'main' || mainBranch === 'master') {
        score -= 15;
        report += `Currently on '${mainBranch}' branch. Use feature branches.\n`;
      }
    } catch {
      // skip
    }

    // Check recent commit messages for conventional commits pattern
    try {
      const log = execSync('git log --oneline -20', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
      const lines = log.trim().split('\n').filter(Boolean);
      const conventionalPattern = /^(feat|fix|docs|style|refactor|test|chore|ci|perf|build|revert)(\(.+\))?: /;
      const conventionalCount = lines.filter(l => conventionalPattern.test(l.split(' ').slice(1).join(' '))).length;
      const ratio = lines.length > 0 ? conventionalCount / lines.length : 0;

      if (ratio >= 0.8) {
        report += `Excellent commit message hygiene (${conventionalCount}/${lines.length} conventional).\n`;
      } else if (ratio >= 0.5) {
        score -= 10;
        report += `Mixed commit messages (${conventionalCount}/${lines.length} conventional). Consider using conventional commits.\n`;
      } else {
        score -= 20;
        report += `Poor commit message hygiene (${conventionalCount}/${lines.length} conventional).\n`;
      }
    } catch {
      // skip
    }

    // Check for .gitignore
    if (fileExists('.gitignore')) {
      const gi = fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf-8');
      const important = ['node_modules', '.env', 'dist', '.soloknuckle'];
      const missing = important.filter(i => !gi.includes(i));
      if (missing.length > 0) {
        score -= 5 * missing.length;
        report += `.gitignore missing: ${missing.join(', ')}.\n`;
      } else {
        report += '.gitignore covers common patterns.\n';
      }
    } else {
      score -= 20;
      report += 'No .gitignore found.\n';
    }

    if (score < 0) score = 0;
    return { score, rawOutput: report || 'Git hygiene looks good.' };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking git hygiene: ${getErrorMessage(err)}` };
  }
}

export function getCIPipelineScore(): DimensionScore {
  try {
    let score = 0;
    let report = '';

    const ciPaths = [
      { file: '.github/workflows', points: 40, label: 'GitHub Actions' },
      { file: '.gitlab-ci.yml', points: 40, label: 'GitLab CI' },
      { file: '.circleci/config.yml', points: 40, label: 'CircleCI' },
      { file: '.travis.yml', points: 40, label: 'Travis CI' },
      { file: 'Jenkinsfile', points: 40, label: 'Jenkins' },
      { file: '.github/dependabot.yml', points: 10, label: 'Dependabot' },
    ];

    for (const ci of ciPaths) {
      if (ci.file.endsWith('/')) {
        // directory check
        if (dirExists(ci.file)) {
          score += ci.points;
          report += `${ci.label}: detected.\n`;
        }
      } else if (fileExists(ci.file)) {
        score += ci.points;
        report += `${ci.label}: detected.\n`;
      }
    }

    // Check if CI runs tests, lint, typecheck, and security audit
    const workflowDir = path.join(process.cwd(), '.github', 'workflows');
    if (fs.existsSync(workflowDir)) {
      const files = fs.readdirSync(workflowDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
      let hasTest = false;
      let hasLint = false;
      let hasTypecheck = false;
      let hasSecurityAudit = false;
      for (const file of files) {
        const content = fs.readFileSync(path.join(workflowDir, file), 'utf-8');
        if (content.includes('test') || content.includes('vitest') || content.includes('jest')) hasTest = true;
        if (content.includes('lint') || content.includes('eslint')) hasLint = true;
        if (content.includes('typecheck') || content.includes('tsc') || content.includes('type-check')) hasTypecheck = true;
        if (content.includes('audit') || content.includes('snyk') || content.includes('codeql') || content.includes('gitleaks')) hasSecurityAudit = true;
      }
      if (hasTest) { score += 10; report += 'CI runs tests.\n'; }
      if (hasLint) { score += 10; report += 'CI runs linting.\n'; }
      if (hasTypecheck) { score += 10; report += 'CI runs type checking.\n'; }
      if (hasSecurityAudit) { score += 10; report += 'CI runs security audit.\n'; }
    }

    if (score === 0) {
      return { score: 0, rawOutput: 'No CI/CD pipeline detected. Consider adding GitHub Actions.' };
    }

    if (score > 100) score = 100;
    return { score, rawOutput: report };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking CI: ${getErrorMessage(err)}` };
  }
}

export function getFeatureFlagsScore(): DimensionScore {
  try {
    let score = 0;
    let report = '';

    if (fileExists('flags.json')) {
      score += 30;
      report += 'flags.json found.\n';

      try {
        const flagsData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'flags.json'), 'utf-8'));
        // flags.json structure: { flags: { flagName: { ... } }, ... }
        const flags = flagsData.flags || flagsData;
        const flagCount = Object.keys(flags).length;
        if (flagCount > 0) {
          score += 20;
          report += `${flagCount} feature flag(s) configured.\n`;
        } else {
          report += 'flags.json exists but has no flags defined.\n';
        }

        // Check if flags are used in code
        const srcDirs = ['src', 'cli', 'lib'];
        let flagRefs = 0;
        for (const dir of srcDirs) {
          const fullDir = path.join(process.cwd(), dir);
          if (!fs.existsSync(fullDir)) continue;
          const scanCode = (d: string) => {
            if (!fs.existsSync(d)) return;
            const entries = fs.readdirSync(d);
            for (const entry of entries) {
              const fp = path.join(d, entry);
              if (fs.statSync(fp).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
                scanCode(fp);
              } else if (fp.endsWith('.ts') || fp.endsWith('.js') || fp.endsWith('.tsx') || fp.endsWith('.jsx')) {
                const content = fs.readFileSync(fp, 'utf-8');
                for (const flag of Object.keys(flags)) {
                  if (content.includes(flag)) flagRefs++;
                }
              }
            }
          };
          scanCode(fullDir);
        }

        if (flagRefs > 0) {
          score += 25;
          report += `Flags referenced in ${flagRefs} source location(s).\n`;
        } else {
          report += 'Flags defined but not referenced in source code.\n';
        }
      } catch {
        report += 'flags.json exists but could not be parsed.\n';
      }
    } else {
      report += 'No flags.json found. Feature flags are recommended for safe deployments.\n';
    }

    // Check for feature flag references in code even without flags.json
    const envFiles = ['.env', '.env.local', '.env.production'];
    let hasFlagEnv = false;
    for (const f of envFiles) {
      if (fileExists(f)) {
        const content = fs.readFileSync(path.join(process.cwd(), f), 'utf-8');
        if (/FLAG|FEATURE|LAUNCHDARKLY|STATSIG|GROWTHBOOK/i.test(content)) {
          hasFlagEnv = true;
          break;
        }
      }
    }
    if (hasFlagEnv) {
      score += 15;
      report += 'Feature flag env vars detected.\n';
    }

    // Bonus for rollout strategy docs
    if (fileExists('ROLLOUT.md') || fileExists('rollout.md')) {
      score += 10;
      report += 'Rollout strategy documented.\n';
    }

    if (score > 100) score = 100;
    if (score === 0) score = 20; // baseline: not everyone uses flags yet
    return { score, rawOutput: report || 'No feature flag setup detected.' };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking feature flags: ${getErrorMessage(err)}` };
  }
}

// ─── New 3 Dimensions ──────────────────────────────────────────────────────

export function getPerformanceScore(): DimensionScore {
  try {
    let score = 100;
    let report = '';

    if (fileExists('package.json')) {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Penalize heavy deps
      const heavyDeps = ['moment', 'lodash', 'underscore', 'jquery'];
      for (const name of heavyDeps) {
        if (deps && deps[name]) {
          score -= 5;
          report += `'${name}' is known to impact bundle size. Consider a lighter alternative.\n`;
        }
      }

      // Check for next/image or image optimization config
      if (fileExists('next.config.js') || fileExists('next.config.mjs') || fileExists('next.config.ts')) {
        report += 'Next.js config detected — image optimization available.\n';
      }

      // Check for bundle analyzer
      if (deps && (deps['webpack-bundle-analyzer'] || deps['@next/bundle-analyzer'])) {
        score += 5;
        report += 'Bundle analyzer is configured.\n';
      }
    }

    // Check for Lighthouse or performance budgets
    const perfFiles = ['lighthouserc.js', 'lighthouserc.json', '.lighthouserc.json', 'performance-budget.json'];
    for (const f of perfFiles) {
      if (fileExists(f)) {
        score += 10;
        report += `Performance config (${f}) found.\n`;
        break;
      }
    }

    if (score > 100) score = 100;
    if (score < 0) score = 0;
    return { score, rawOutput: report || 'No performance issues detected.' };
  } catch (err: unknown) {
    return { score: 70, rawOutput: `Error checking performance: ${getErrorMessage(err)}` };
  }
}

export function getReliabilityScore(): DimensionScore {
  try {
    let score = 100;
    let report = '';

    // Check for error tracking
    const errorTrackingPkgs = ['@sentry/node', '@sentry/browser', '@sentry/react', 'rollbar', 'bugsnag', '@datadog/browser-rum'];
    const pkgPath = path.join(process.cwd(), 'package.json');
    let hasErrorTracking = false;
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const p of errorTrackingPkgs) {
        if (allDeps && allDeps[p]) {
          hasErrorTracking = true;
          break;
        }
      }
    }
    if (hasErrorTracking) {
      score += 5;
      report += 'Error tracking service detected.\n';
    } else {
      score -= 10;
      report += 'No error tracking service (Sentry, Rollbar, etc.) detected.\n';
    }

    // Check for retry/timeout patterns in source
    const srcDirs = ['src', 'cli', 'lib', 'api'];
    let retryCount = 0;
    for (const dir of srcDirs) {
      const fullDir = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullDir)) continue;
      const scanCode = (d: string) => {
        if (!fs.existsSync(d)) return;
        const entries = fs.readdirSync(d);
        for (const entry of entries) {
          const fp = path.join(d, entry);
          if (fs.statSync(fp).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
            scanCode(fp);
          } else if (fp.endsWith('.ts') || fp.endsWith('.js')) {
            const content = fs.readFileSync(fp, 'utf-8');
            if (/retry|backoff|exponential/i.test(content)) retryCount++;
          }
        }
      };
      scanCode(fullDir);
    }

    if (retryCount > 0) {
      score += 5;
      report += `Retry/backoff logic found in ${retryCount} file(s).\n`;
    } else {
      score -= 5;
      report += 'No retry/backoff patterns found — transient failures may propagate.\n';
    }

    // Check for health check endpoint
    let hasHealthCheck = false;
    for (const dir of srcDirs) {
      const fullDir = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullDir)) continue;
      const scanCode = (d: string) => {
        if (!fs.existsSync(d) || hasHealthCheck) return;
        const entries = fs.readdirSync(d);
        for (const entry of entries) {
          const fp = path.join(d, entry);
          if (fs.statSync(fp).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
            scanCode(fp);
          } else if (fp.endsWith('.ts') || fp.endsWith('.js')) {
            const content = fs.readFileSync(fp, 'utf-8');
            if (/\/health|\/healthz|\/ready|\/readiness/i.test(content)) hasHealthCheck = true;
          }
        }
      };
      scanCode(fullDir);
    }

    if (hasHealthCheck) {
      score += 10;
      report += 'Health check endpoint detected.\n';
    } else {
      score -= 5;
      report += 'No health check endpoint found.\n';
    }

    if (score > 100) score = 100;
    if (score < 0) score = 0;
    return { score, rawOutput: report || 'Reliability checks passed.' };
  } catch (err: unknown) {
    return { score: 70, rawOutput: `Error checking reliability: ${getErrorMessage(err)}` };
  }
}

export function getSupplyChainScore(): DimensionScore {
  try {
    let score = 50;
    let report = '';

    // Lock file integrity
    const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const hasLockFile = lockFiles.some(f => fileExists(f));
    if (hasLockFile) {
      score += 20;
      report += 'Lock file present — installs are reproducible.\n';
    } else {
      report += 'No lock file — supply chain integrity is weakened.\n';
    }

    // Check for .npmrc or registry config
    if (fileExists('.npmrc')) {
      score += 10;
      report += '.npmrc detected — custom registry config present.\n';
    }

    // Check for Dependabot / Renovate
    if (fileExists('.github/dependabot.yml') || fileExists('.github/dependabot.yaml') || fileExists('renovate.json') || fileExists('.renovaterc') || fileExists('.renovaterc.json')) {
      score += 15;
      report += 'Dependency update bot (Dependabot/Renovate) configured.\n';
    } else {
      report += 'No dependency update bot detected.\n';
    }

    // Check for pinned versions in package.json
    if (fileExists('package.json')) {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps) {
        const deps = Object.entries(allDeps) as [string, string][];
        const pinnedCount = deps.filter(([, v]) => !v.startsWith('^') && !v.startsWith('~') && !v.startsWith('>') && v !== '*').length;
        const ratio = deps.length > 0 ? pinnedCount / deps.length : 0;
        if (ratio > 0.8) {
          score += 10;
          report += `Good version pinning (${pinnedCount}/${deps.length} deps pinned).\n`;
        } else if (ratio > 0.5) {
          score += 5;
          report += `Moderate version pinning (${pinnedCount}/${deps.length} deps pinned).\n`;
        } else {
          report += `Low version pinning (${pinnedCount}/${deps.length} deps pinned). Consider pinning more deps.\n`;
        }
      }
    }

    if (score > 100) score = 100;
    if (score < 0) score = 0;
    return { score, rawOutput: report || 'Supply chain checks passed.' };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking supply chain: ${getErrorMessage(err)}` };
  }
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
