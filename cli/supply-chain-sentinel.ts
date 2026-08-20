import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface SentinelFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  package: string;
  message: string;
  details: string;
}

interface SentinelReport {
  scanTime: string;
  depth: string;
  findings: SentinelFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  riskScore: number;
  recommendation: string;
}

const LIFECYCLE_SCRIPTS = [
  'preinstall', 'postinstall', 'install', 'preuninstall', 'postuninstall',
  'prepare', 'prepublish', 'postpublish', 'prepack', 'postpack',
];

const HIGH_RISK_PACKAGES = [
  'node-ipc', 'flatmap-stream', 'event-stream', 'getcookies',
  'crossenv', 'cross-env.js', 'babelcli', 'babel-cli.js',
];

const TYPOSQUAT_PATTERNS = [
  /^(cross-env|cross-env\.js|crossenv|cross-env-[\w-]+)$/,
  /^(eslint|eslint-[\w-]+|eslintconfig-[\w-]+|eslintplugin-[\w-]+)$/,
  /^(lodash|lodash-[\w-]+|lodash\.function|lodash\.object|lodash\.method)$/,
  /^(chalk|chalk-[\w-]+|chalk-pipe|chalk-ansi-[\w-]+)$/,
];

export class SupplyChainSentinel {
  private findings: SentinelFinding[] = [];
  private packageJson: Record<string, unknown> | null = null;
  private lockFile: string | null = null;

  constructor() {
    this.loadPackageJson();
    this.detectLockFile();
  }

  private loadPackageJson(): void {
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        this.packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      }
    } catch {
      // package.json not found or invalid
    }
  }

  private detectLockFile(): void {
    const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    for (const lock of lockFiles) {
      if (fs.existsSync(path.join(process.cwd(), lock))) {
        this.lockFile = lock;
        break;
      }
    }
  }

  scan(depth: 'quick' | 'standard' | 'deep' = 'standard'): SentinelReport {
    this.findings = [];

    this.checkLifecycleScripts();
    this.checkHighRiskPackages();
    this.checkTyposquatting();

    if (depth === 'standard' || depth === 'deep') {
      this.checkLockfileIntegrity();
      this.checkRegistryConfig();
    }

    if (depth === 'deep') {
      this.checkNpmAudit();
      this.checkPackageAge();
    }

    return this.generateReport(depth);
  }

  private checkLifecycleScripts(): void {
    if (!this.packageJson) return;

    const deps = {
      ...((this.packageJson as Record<string, unknown>).dependencies as Record<string, unknown> || {}),
      ...((this.packageJson as Record<string, unknown>).devDependencies as Record<string, unknown> || {}),
    };

    for (const [name, version] of Object.entries(deps)) {
      const nodeModulesPath = path.join(process.cwd(), 'node_modules', name, 'package.json');
      if (!fs.existsSync(nodeModulesPath)) continue;

      try {
        const depPkg = JSON.parse(fs.readFileSync(nodeModulesPath, 'utf-8'));
        const scripts = (depPkg as Record<string, unknown>).scripts as Record<string, unknown> || {};

        for (const script of LIFECYCLE_SCRIPTS) {
          if (scripts[script]) {
            const scriptStr = String(scripts[script]);
            const isSuspicious = this.analyzeLifecycleScript(scriptStr);
            if (isSuspicious) {
              this.findings.push({
                severity: 'high',
                category: 'lifecycle-script',
                package: name,
                message: `Suspicious ${script} script detected`,
                details: `Script: ${scriptStr.substring(0, 200)}`,
              });
            }
          }
        }
      } catch {
        // skip unreadable packages
      }
    }
  }

  private analyzeLifecycleScript(script: string): boolean {
    const suspiciousPatterns = [
      /curl\s+.*\|\s*(bash|sh)/i,
      /wget\s+.*\|\s*(bash|sh)/i,
      /node\s+.*\.(js|mjs|cjs)/i,
      /eval\s*\(/i,
      /child_process/i,
      /exec\s*\(/i,
      /spawn\s*\(/i,
      /https?:\/\/.*\.(sh|js)/i,
      /base64\s+(--decode|-[dD])/i,
      /chmod\s+[0-7]*\s+[a-z]/i,
    ];

    return suspiciousPatterns.some(p => p.test(script));
  }

  private checkHighRiskPackages(): void {
    if (!this.packageJson) return;

    const deps = {
      ...((this.packageJson as Record<string, unknown>).dependencies as Record<string, unknown> || {}),
      ...((this.packageJson as Record<string, unknown>).devDependencies as Record<string, unknown> || {}),
    };

    for (const pkg of HIGH_RISK_PACKAGES) {
      if (deps[pkg]) {
        this.findings.push({
          severity: 'critical',
          category: 'known-malware',
          package: pkg,
          message: `Known malicious package detected: ${pkg}`,
          details: 'This package has been involved in supply chain attacks. Remove immediately.',
        });
      }
    }
  }

  private checkTyposquatting(): void {
    if (!this.packageJson) return;

    const deps = {
      ...((this.packageJson as Record<string, unknown>).dependencies as Record<string, unknown> || {}),
      ...((this.packageJson as Record<string, unknown>).devDependencies as Record<string, unknown> || {}),
    };

    for (const name of Object.keys(deps)) {
      for (const pattern of TYPOSQUAT_PATTERNS) {
        if (!pattern.test(name)) continue;
        
        if (name.includes('.js') || name.includes('.') || name.length < 3) {
          this.findings.push({
            severity: 'medium',
            category: 'typosquatting',
            package: name,
            message: `Possible typosquatting: ${name}`,
            details: 'Package name contains unusual characters or patterns that may indicate typosquatting.',
          });
        }
      }
    }
  }

  private checkLockfileIntegrity(): void {
    if (!this.lockFile) {
      this.findings.push({
        severity: 'high',
        category: 'lockfile-missing',
        package: '',
        message: 'No lockfile found',
        details: 'Lockfile is critical for reproducible installs and supply chain integrity.',
      });
      return;
    }

    try {
      const lockPath = path.join(process.cwd(), this.lockFile);
      const lockContent = fs.readFileSync(lockPath, 'utf-8');
      
      if (this.lockFile === 'package-lock.json') {
        const lockData = JSON.parse(lockContent);
        if (!lockData.packages || !lockData.lockfileVersion) {
          this.findings.push({
            severity: 'medium',
            category: 'lockfile-corrupt',
            package: '',
            message: 'Lockfile may be corrupted or outdated',
            details: 'Regenerate with `npm install` to ensure integrity.',
          });
        }
      }
    } catch {
      // skip
    }
  }

  private checkRegistryConfig(): void {
    const npmrcPath = path.join(process.cwd(), '.npmrc');
    if (!fs.existsSync(npmrcPath)) {
      this.findings.push({
        severity: 'low',
        category: 'registry-config',
        package: '',
        message: 'No .npmrc found',
        details: 'Consider adding .npmrc with registry restrictions for enhanced security.',
      });
      return;
    }

    try {
      const npmrcContent = fs.readFileSync(npmrcPath, 'utf-8');
      if (npmrcContent.includes('registry=')) {
        // Custom registry configured - good
      } else {
        this.findings.push({
          severity: 'low',
          category: 'registry-config',
          package: '',
          message: '.npmrc exists but no custom registry configured',
          details: 'Consider restricting package installations to official npm registry.',
        });
      }
    } catch {
      // skip
    }
  }

  private checkNpmAudit(): void {
    try {
      const auditOutput = execSync('npm audit --json', {
        encoding: 'utf-8',
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const auditData = JSON.parse(auditOutput);
      
      if (auditData.metadata?.vulnerabilities?.critical > 0) {
        this.findings.push({
          severity: 'critical',
          category: 'npm-audit',
          package: '',
          message: `Critical vulnerabilities detected: ${auditData.metadata.vulnerabilities.critical}`,
          details: 'Run `npm audit` for details and apply patches.',
        });
      }
      if (auditData.metadata?.vulnerabilities?.high > 0) {
        this.findings.push({
          severity: 'high',
          category: 'npm-audit',
          package: '',
          message: `High-severity vulnerabilities detected: ${auditData.metadata.vulnerabilities.high}`,
          details: 'Run `npm audit` for details and apply patches.',
        });
      }
    } catch {
      // npm audit failed - might not have lock file or network
    }
  }

  private checkPackageAge(): void {
    if (!this.packageJson) return;

    const deps = {
      ...((this.packageJson as Record<string, unknown>).dependencies as Record<string, unknown> || {}),
    };

    for (const [name] of Object.entries(deps)) {
      const pkgPath = path.join(process.cwd(), 'node_modules', name);
      if (!fs.existsSync(pkgPath)) continue;

      try {
        const stat = fs.statSync(pkgPath);
        const ageInDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
        
        if (ageInDays > 365) {
          // Package hasn't been updated in over a year
          // This is a signal but not necessarily suspicious
        }
      } catch {
        // skip
      }
    }
  }

  private generateReport(depth: string): SentinelReport {
    const summary = {
      critical: this.findings.filter(f => f.severity === 'critical').length,
      high: this.findings.filter(f => f.severity === 'high').length,
      medium: this.findings.filter(f => f.severity === 'medium').length,
      low: this.findings.filter(f => f.severity === 'low').length,
    };

    const riskScore = Math.min(100, 
      (summary.critical * 30) + 
      (summary.high * 15) + 
      (summary.medium * 5) + 
      (summary.low * 1)
    );

    let recommendation = 'No critical supply chain risks detected.';
    if (summary.critical > 0) {
      recommendation = 'URGENT: Critical supply chain issues detected. Review and remediate immediately.';
    } else if (summary.high > 0) {
      recommendation = 'Review high-severity findings and consider removing suspicious packages.';
    } else if (summary.medium > 0) {
      recommendation = 'Review medium-severity findings for potential improvements.';
    }

    return {
      scanTime: new Date().toISOString(),
      depth,
      findings: this.findings,
      summary,
      riskScore,
      recommendation,
    };
  }
}