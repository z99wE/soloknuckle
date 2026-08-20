import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { ScoreMetrics, calculateMetrics, calculateSevenDomainScorecard, evaluateHardGates } from './scorer';

interface ComplianceCheck {
  name: string;
  passed: boolean;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  fix?: string;
}

interface ComplianceReport {
  projectName: string;
  timestamp: string;
  overallScore: number;
  checks: ComplianceCheck[];
  passed: boolean;
}

function getProjectName(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    return pkg.name || path.basename(process.cwd());
  } catch {
    return path.basename(process.cwd());
  }
}

function fileExists(p: string): boolean {
  return fs.existsSync(path.join(process.cwd(), p));
}

function runChecks(metrics: ScoreMetrics): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  // 1. No hardcoded secrets
  const secretPatterns = [
    /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
    /secret\s*[:=]\s*['"][^'"]+['"]/i,
    /password\s*[:=]\s*['"][^'"]+['"]/i,
    /token\s*[:=]\s*['"][^'"]+['"]/i,
  ];

  let hasSecrets = false;
  const srcDirs = ['src', 'cli', 'lib', 'api'];
  for (const dir of srcDirs) {
    const fullDir = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullDir)) continue;
    const scanDir = (d: string) => {
      if (!fs.existsSync(d)) return;
      const entries = fs.readdirSync(d);
      for (const entry of entries) {
        const fp = path.join(d, entry);
        if (fs.statSync(fp).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
          scanDir(fp);
        } else if (fp.endsWith('.ts') || fp.endsWith('.js')) {
          const content = fs.readFileSync(fp, 'utf-8');
          for (const pattern of secretPatterns) {
            if (pattern.test(content)) {
              hasSecrets = true;
              break;
            }
          }
        }
      }
    };
    scanDir(fullDir);
  }

  checks.push({
    name: 'No hardcoded secrets',
    passed: !hasSecrets,
    severity: 'critical',
    message: hasSecrets ? 'Hardcoded secrets detected in source code' : 'No hardcoded secrets found',
    fix: 'Move secrets to environment variables and .env files',
  });

  // 2. .env not in version control
  const gitignoreHasEnv = fileExists('.gitignore') &&
    fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf-8').includes('.env');
  checks.push({
    name: '.env excluded from git',
    passed: gitignoreHasEnv,
    severity: 'critical',
    message: gitignoreHasEnv ? '.env is in .gitignore' : '.env not found in .gitignore',
    fix: 'Add .env to .gitignore',
  });

  // 3. No eval() in source
  let hasEval = false;
  for (const dir of srcDirs) {
    const fullDir = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullDir)) continue;
    const scanDir = (d: string) => {
      if (!fs.existsSync(d)) return;
      const entries = fs.readdirSync(d);
      for (const entry of entries) {
        const fp = path.join(d, entry);
        if (fs.statSync(fp).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
          scanDir(fp);
        } else if (fp.endsWith('.ts') || fp.endsWith('.js')) {
          const content = fs.readFileSync(fp, 'utf-8');
          if (/\beval\s*\(/.test(content)) hasEval = true;
        }
      }
    };
    scanDir(fullDir);
  }

  checks.push({
    name: 'No eval() usage',
    passed: !hasEval,
    severity: 'critical',
    message: hasEval ? 'eval() detected in source code' : 'No eval() usage found',
    fix: 'Replace eval() with safer alternatives',
  });

  // 4. Security score threshold
  checks.push({
    name: 'Security score ≥ 70',
    passed: metrics.security.score >= 70,
    severity: 'critical',
    message: `Security score: ${metrics.security.score}/100`,
  });

  // 5. Testing score threshold
  checks.push({
    name: 'Testing score ≥ 70',
    passed: metrics.testing.score >= 70,
    severity: 'critical',
    message: `Testing score: ${metrics.testing.score}/100`,
  });

  // 6. Lock file present
  const hasLock = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].some(f => fileExists(f));
  checks.push({
    name: 'Lock file present',
    passed: hasLock,
    severity: 'warning',
    message: hasLock ? 'Lock file found' : 'No lock file found',
    fix: 'Run npm install to generate a lock file',
  });

  // 7. README exists
  checks.push({
    name: 'README.md present',
    passed: fileExists('README.md'),
    severity: 'info',
    message: fileExists('README.md') ? 'README.md found' : 'README.md missing',
  });

  // 8. CI pipeline exists
  const hasCI = fileExists('.github/workflows') || fileExists('.gitlab-ci.yml') ||
    fileExists('.circleci/config.yml') || fileExists('.travis.yml');
  checks.push({
    name: 'CI/CD pipeline',
    passed: hasCI,
    severity: 'warning',
    message: hasCI ? 'CI/CD pipeline detected' : 'No CI/CD pipeline found',
    fix: 'Add a CI pipeline to catch issues before they reach production',
  });

  // 9. No dangerouslySetInnerHTML
  let hasDangerous = false;
  for (const dir of srcDirs) {
    const fullDir = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullDir)) continue;
    const scanDir = (d: string) => {
      if (!fs.existsSync(d)) return;
      const entries = fs.readdirSync(d);
      for (const entry of entries) {
        const fp = path.join(d, entry);
        if (fs.statSync(fp).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
          scanDir(fp);
        } else if (fp.endsWith('.tsx') || fp.endsWith('.jsx')) {
          const content = fs.readFileSync(fp, 'utf-8');
          if (/dangerouslySetInnerHTML/.test(content)) hasDangerous = true;
        }
      }
    };
    scanDir(fullDir);
  }

  checks.push({
    name: 'No dangerouslySetInnerHTML',
    passed: !hasDangerous,
    severity: 'critical',
    message: hasDangerous ? 'dangerouslySetInnerHTML detected' : 'No dangerouslySetInnerHTML usage',
    fix: 'Use textContent or safe HTML sanitization instead',
  });

  // 10. HTTPS only in production URLs
  let hasHttp = false;
  for (const dir of srcDirs) {
    const fullDir = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullDir)) continue;
    const scanDir = (d: string) => {
      if (!fs.existsSync(d)) return;
      const entries = fs.readdirSync(d);
      for (const entry of entries) {
        const fp = path.join(d, entry);
        if (fs.statSync(fp).isDirectory() && entry !== 'node_modules' && entry !== '.git') {
          scanDir(fp);
        } else if (fp.endsWith('.ts') || fp.endsWith('.js')) {
          const content = fs.readFileSync(fp, 'utf-8');
          if (/http:\/\/(?!localhost|127\.0\.0\.1)/.test(content)) hasHttp = true;
        }
      }
    };
    scanDir(fullDir);
  }

  checks.push({
    name: 'HTTPS only (non-localhost)',
    passed: !hasHttp,
    severity: 'warning',
    message: hasHttp ? 'HTTP URLs found in source (non-localhost)' : 'All URLs use HTTPS',
    fix: 'Replace http:// with https:// for non-local URLs',
  });

  return checks;
}

export function runCompliance(): ComplianceReport {
  const metrics = calculateMetrics();
  const checks = runChecks(metrics);
  const passed = checks.every(c => c.passed || c.severity !== 'critical');

  return {
    projectName: getProjectName(),
    timestamp: new Date().toISOString(),
    overallScore: metrics.overall,
    checks,
    passed,
  };
}

export function printComplianceReport(report: ComplianceReport): void {
  console.log(chalk.bold.cyan('\n  🔍  Self-Compliance Audit'));
  console.log(chalk.dim('  ' + '─'.repeat(40)));
  console.log(`  Project: ${chalk.bold(report.projectName)}`);
  console.log(`  Score:   ${report.overallScore}/100`);
  console.log('');

  const passed = report.checks.filter(c => c.passed);
  const failed = report.checks.filter(c => !c.passed);

  console.log(chalk.green(`  ✓ ${passed.length} passed`));
  if (failed.length > 0) {
    console.log(chalk.red(`  ✗ ${failed.length} failed`));
  }
  console.log('');

  for (const check of report.checks) {
    const icon = check.passed ? chalk.green('✓') : check.severity === 'critical' ? chalk.red('✗') : chalk.yellow('⚠');
    const status = check.passed ? chalk.green('PASS') : check.severity === 'critical' ? chalk.red('FAIL') : chalk.yellow('WARN');
    console.log(`  ${icon} ${chalk.bold(check.name.padEnd(30))} ${status}  ${chalk.dim(check.message)}`);
    if (!check.passed && check.fix) {
      console.log(chalk.cyan(`    → ${check.fix}`));
    }
  }

  console.log('');
  if (report.passed) {
    console.log(chalk.green.bold('  ✓ All critical checks passed — compliant'));
  } else {
    console.log(chalk.red.bold('  ✗ Critical checks failed — not compliant'));
  }
  console.log('');
}
