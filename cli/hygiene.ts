import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { scanDiffForSecretsAndPII } from './scanner';
import { calculateMetrics } from './scorer';
import { getTelemetry } from './telemetry';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'skip';
  score: number;   // 0-100
  message: string;
}

export interface HygieneReport {
  timestamp: string;
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: CheckResult[];
  passed: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fileExists(p: string): boolean {
  return fs.existsSync(path.join(process.cwd(), p));
}

function runSafe(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe', timeout: 30000 });
    return { ok: true, output };
  } catch (e: unknown) {
    const output = e && typeof e === 'object' && 'stdout' in e
      ? String((e as { stdout: string }).stdout || '')
      : e instanceof Error ? e.message : '';
    return { ok: false, output };
  }
}

function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ─── Individual Checks ─────────────────────────────────────────────────────

function checkSecrets(): CheckResult {
  let diff = '';
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: process.cwd() });
    diff = execSync('git diff --cached', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
    if (!diff) diff = execSync('git diff', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
  } catch { /* no git */ }

  const violations = scanDiffForSecretsAndPII(diff);
  if (violations.length === 0) {
    return { name: 'Secrets & PII', status: 'pass', score: 100, message: 'No secrets or PII in staged changes.' };
  }
  return {
    name: 'Secrets & PII',
    status: 'fail',
    score: Math.max(0, 100 - violations.length * 25),
    message: `${violations.length} violation(s) found:\n${violations.join('\n')}`,
  };
}

function checkGuardrails(): CheckResult {
  const checks: string[] = [];

  if (fileExists('AGENTS.md')) checks.push('AGENTS.md');
  if (fileExists('.cursorrules')) checks.push('.cursorrules');
  if (fileExists('SKILL.md')) checks.push('SKILL.md');

  if (checks.length >= 2) {
    return { name: 'Agent Guardrails', status: 'pass', score: 100, message: `Guardrails present: ${checks.join(', ')}` };
  }
  if (checks.length === 1) {
    return { name: 'Agent Guardrails', status: 'warn', score: 60, message: `Partial guardrails: ${checks[0]}. Consider adding more.` };
  }
  return { name: 'Agent Guardrails', status: 'fail', score: 0, message: 'No guardrails found. Run `npx soloknuckle init` to scaffold.' };
}

function checkTelemetry(): CheckResult {
  const telemetryFile = path.join(process.cwd(), '.soloknuckle', 'telemetry.json');
  if (!fs.existsSync(telemetryFile)) {
    return { name: 'AI Telemetry', status: 'skip', score: 50, message: 'Telemetry not initialized. Run an audit first to start tracking.' };
  }

  const data = getTelemetry();
  const total = (data.humanCommits || 0) + (data.aiCommits || 0);
  if (total === 0) {
    return { name: 'AI Telemetry', status: 'warn', score: 50, message: 'Telemetry initialized but no commits tracked yet.' };
  }

  const aiRatio = data.aiCommits / total;
  if (aiRatio > 0.8) {
    return {
      name: 'AI Telemetry',
      status: 'warn',
      score: 70,
      message: `High AI usage: ${data.aiCommits}/${total} commits (${Math.round(aiRatio * 100)}% AI). Monitor quality.`,
    };
  }

  return {
    name: 'AI Telemetry',
    status: 'pass',
    score: 100,
    message: `Telemetry active. ${data.humanCommits} human, ${data.aiCommits} AI commits.`,
  };
}

function checkQuality(): CheckResult {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return { name: 'Code Quality', status: 'skip', score: 50, message: 'No package.json found.' };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (!pkg.scripts?.lint) {
      return { name: 'Code Quality', status: 'warn', score: 40, message: 'No lint script. Add ESLint or similar.' };
    }

    const result = runSafe('npm run lint');
    if (result.ok) {
      return { name: 'Code Quality', status: 'pass', score: 100, message: 'Linting passes.' };
    }

    const errors = (result.output.match(/error/gi) || []).length;
    return {
      name: 'Code Quality',
      status: errors > 5 ? 'fail' : 'warn',
      score: Math.max(0, 100 - errors * 10),
      message: `Lint found ${errors} error(s).`,
    };
  } catch {
    return { name: 'Code Quality', status: 'skip', score: 50, message: 'Could not run lint check.' };
  }
}

function checkFeatureFlags(): CheckResult {
  if (!fileExists('flags.json')) {
    return { name: 'Feature Flags', status: 'warn', score: 30, message: 'No flags.json. Feature flags recommended for safe deploys.' };
  }

  try {
    const flags = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'flags.json'), 'utf-8'));
    const flagCount = Object.keys(flags).length;
    const enabledCount = Object.values(flags).filter(Boolean).length;

    return {
      name: 'Feature Flags',
      status: enabledCount === 0 ? 'warn' : 'pass',
      score: enabledCount > 0 ? 100 : 60,
      message: `${flagCount} flag(s), ${enabledCount} enabled.`,
    };
  } catch {
    return { name: 'Feature Flags', status: 'fail', score: 20, message: 'flags.json exists but is invalid JSON.' };
  }
}

function checkDependencies(): CheckResult {
  if (!fileExists('package.json')) {
    return { name: 'Dependencies', status: 'skip', score: 50, message: 'No package.json.' };
  }

  const hasLock = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].some(f => fileExists(f));
  if (!hasLock) {
    return { name: 'Dependencies', status: 'warn', score: 40, message: 'No lock file. Reproducible installs not guaranteed.' };
  }

  const audit = runSafe('npm audit --json 2>/dev/null');
  if (audit.ok) {
    try {
      const data = JSON.parse(audit.output);
      const critical = data.metadata?.vulnerabilities?.critical || 0;
      const high = data.metadata?.vulnerabilities?.high || 0;
      if (critical > 0) {
        return { name: 'Dependencies', status: 'fail', score: 20, message: `${critical} critical vulnerabilities!` };
      }
      if (high > 0) {
        return { name: 'Dependencies', status: 'warn', score: 60, message: `${high} high-severity vulnerabilities.` };
      }
      return { name: 'Dependencies', status: 'pass', score: 100, message: 'No known vulnerabilities.' };
    } catch {
      // parse error
    }
  }

  return { name: 'Dependencies', status: 'warn', score: 70, message: 'Lock file present. Could not run npm audit.' };
}

function checkDeployment(): CheckResult {
  const ciPaths = [
    '.github/workflows',
    '.gitlab-ci.yml',
    '.circleci/config.yml',
    '.travis.yml',
    'Jenkinsfile',
  ];

  const found = ciPaths.filter(p => {
    if (p.endsWith('/')) {
      return fs.existsSync(path.join(process.cwd(), p));
    }
    return fileExists(p);
  });

  if (found.length > 0) {
    return { name: 'Deployment', status: 'pass', score: 100, message: `CI/CD detected: ${found.join(', ')}` };
  }

  return { name: 'Deployment', status: 'warn', score: 30, message: 'No CI/CD pipeline found. Consider adding GitHub Actions.' };
}

function checkAccessibility(): CheckResult {
  const dirs = [path.join(process.cwd(), 'ui', 'src'), path.join(process.cwd(), 'src')];
  let issues = 0;

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const scanDir = (d: string) => {
      if (!fs.existsSync(d)) return;
      const entries = fs.readdirSync(d);
      for (const entry of entries) {
        const fp = path.join(d, entry);
        if (fs.statSync(fp).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
          scanDir(fp);
        } else if (fp.endsWith('.html') || fp.endsWith('.jsx') || fp.endsWith('.tsx')) {
          const content = fs.readFileSync(fp, 'utf-8');
          const imgs = content.match(/<img[^>]*>/g) || [];
          imgs.forEach(img => { if (!img.includes('alt=')) issues++; });
          const btns = content.match(/<button[^>]*>/g) || [];
          btns.forEach(btn => {
            if (!btn.includes('aria-label') && !btn.includes('title=')) issues++;
          });
        }
      }
    };
    scanDir(dir);
  }

  if (issues === 0) {
    return { name: 'Accessibility', status: 'pass', score: 100, message: 'No obvious a11y violations.' };
  }
  return {
    name: 'Accessibility',
    status: issues > 5 ? 'fail' : 'warn',
    score: Math.max(0, 100 - issues * 15),
    message: `${issues} accessibility issue(s) found.`,
  };
}

// ─── Main Report Generator ─────────────────────────────────────────────────

export function runHygieneCheck(): HygieneReport {
  const checks: CheckResult[] = [
    checkSecrets(),
    checkGuardrails(),
    checkTelemetry(),
    checkQuality(),
    checkFeatureFlags(),
    checkDependencies(),
    checkDeployment(),
    checkAccessibility(),
  ];

  const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
  const overallScore = Math.round(totalScore / checks.length);
  const grade = getGrade(overallScore);
  const passed = checks.every(c => c.status !== 'fail');

  return {
    timestamp: new Date().toISOString(),
    overallScore,
    grade,
    checks,
    passed,
  };
}

/**
 * Returns the report as a formatted string for CLI output.
 */
export function formatHygieneReport(report: HygieneReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('  SOLOKNUCKLE HYGIENE REPORT');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push(`  Overall Score: ${report.overallScore}/100  (Grade: ${report.grade})`);
  lines.push(`  Status: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('───────────────────────────────────────────────────────');
  lines.push('');

  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : check.status === 'skip' ? '⏭️' : '❌';
    lines.push(`  ${icon} ${check.name}: ${check.score}/100`);
    lines.push(`     ${check.message.split('\n')[0]}`);
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════');
  lines.push(`  Generated at: ${report.timestamp}`);
  lines.push('═══════════════════════════════════════════════════════');
  return lines.join('\n');
}
