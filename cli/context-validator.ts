import fs from 'fs';
import path from 'path';

// ─── Context-Aware Test Validator ──────────────────────────────────────────
// Detects tests in isolation, missing real DB/network mocks (Same-Model Blindness)
// This addresses the critical gap where tests run in isolation but don't test
// the actual integration with database, network, and external services

export interface TestContextIssue {
  type: 'missing-mock' | 'real-dependency' | 'no-assertion' | 'no-cleanup' | 'hardcoded-value';
  file: string;
  line: number;
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

export interface ContextValidationResult {
  score: number;
  issues: TestContextIssue[];
  summary: {
    totalTests: number;
    testsWithContextIssues: number;
    missingMocks: number;
    realDependencies: number;
    noAssertions: number;
    noCleanup: number;
  };
}

// ─── Patterns to Detect ────────────────────────────────────────────────────

const MOCK_PATTERNS = [
  // Jest mocks
  /jest\.mock\(/g,
  /jest\.spyOn\(/g,
  /mock\(/g,
  /vi\.mock\(/g,
  /vi\.spyOn\(/g,

  // Sinon mocks
  /sinon\.stub\(/g,
  /sinon\.mock\(/g,
  /sinon\.spy\(/g,

  // MSW (Mock Service Worker)
  /setupServer\(/g,
  /rest\.get\(/g,
  /rest\.post\(/g,
  /http\.get\(/g,
  /http\.post\(/g,

  // Database mocks
  /mockDatabase\(/g,
  /mockDb\(/g,
  /mockPrisma\(/g,
  /mockPool\(/g,
];

const REAL_DEPENDENCY_PATTERNS = [
  // Real database connections
  /new\s+Pool\(/g,
  /createClient\(/g,
  /PrismaClient\(/g,
  /mongoose\.connect\(/g,
  /createConnection\(/g,

  // Real HTTP requests
  /fetch\(/g,
  /axios\(/g,
  /request\(/g,
  /got\(/g,
  /superagent\(/g,

  // Real file system operations
  /fs\.writeFile\(/g,
  /fs\.unlink\(/g,
  /fs\.mkdir\(/g,
  /fs\.rmdir\(/g,
  /fs\.rm\(/g,

  // Real network calls
  /net\.connect\(/g,
  /tls\.connect\(/g,
  /dgram\.createSocket\(/g,
];

const ASSERTION_PATTERNS = [
  // Jest assertions
  /expect\(/g,
  /assert\(/g,
  /assertEqual\(/g,
  /assertDeepEqual\(/g,
  /toBe\(/g,
  /toEqual\(/g,
  /toMatch\(/g,
  /toContain\(/g,
  /toThrow\(/g,

  // Chai assertions
  /\.to\.be\./g,
  /\.to\.have\./g,
  /\.to\.equal\./g,
  /\.to\.deep\.equal\./g,

  // Vitest assertions
  /expect\(/g,
  /vi\.expect\(/g,
];

const CLEANUP_PATTERNS = [
  // Jest cleanup
  /afterEach\(/g,
  /afterAll\(/g,
  /beforeEach\(/g,
  /beforeAll\(/g,

  // Vitest cleanup
  /afterEach\(/g,
  /afterAll\(/g,
  /beforeEach\(/g,
  /beforeAll\(/g,

  // Database cleanup
  /cleanup\(/g,
  /resetDatabase\(/g,
  /clearDatabase\(/g,
  /truncate\(/g,
  /deleteMany\(/g,
  /deleteAll\(/g,
];

const HARDCODED_VALUE_PATTERNS = [
  // Hardcoded URLs
  /https?:\/\/[^\s'"]+/g,
  /localhost:\d+/g,
  /127\.0\.0\.1:\d+/g,

  // Hardcoded IPs
  /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g,

  // Hardcoded ports
  /:\d{4,5}/g,

  // Hardcoded credentials
  /password\s*[:=]\s*['"][^'"]+['"]/g,
  /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/g,
  /secret\s*[:=]\s*['"][^'"]+['"]/g,
];

// ─── Test File Analysis ────────────────────────────────────────────────────

function analyzeTestFile(filePath: string, content: string): TestContextIssue[] {
  const issues: TestContextIssue[] = [];
  const lines = content.split('\n');

  let hasMocks = false;
  let hasRealDependencies = false;
  let hasAssertions = false;
  let hasCleanup = false;

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmedLine = line.trim();

    // Skip comments and empty lines
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine === '') {
      return;
    }

    // Check for mocks
    for (const pattern of MOCK_PATTERNS) {
      if (pattern.test(line)) {
        hasMocks = true;
        break;
      }
    }

    // Check for real dependencies
    for (const pattern of REAL_DEPENDENCY_PATTERNS) {
      if (pattern.test(line)) {
        hasRealDependencies = true;
        issues.push({
          type: 'real-dependency',
          file: filePath,
          line: lineNum,
          severity: 'high',
          message: `Real dependency detected: ${line.trim()}`,
          suggestion: 'Mock this dependency to ensure test isolation',
        });
        break;
      }
    }

    // Check for assertions
    for (const pattern of ASSERTION_PATTERNS) {
      if (pattern.test(line)) {
        hasAssertions = true;
        break;
      }
    }

    // Check for cleanup
    for (const pattern of CLEANUP_PATTERNS) {
      if (pattern.test(line)) {
        hasCleanup = true;
        break;
      }
    }

    // Check for hardcoded values
    for (const pattern of HARDCODED_VALUE_PATTERNS) {
      if (pattern.test(line)) {
        issues.push({
          type: 'hardcoded-value',
          file: filePath,
          line: lineNum,
          severity: 'medium',
          message: `Hardcoded value detected: ${line.trim()}`,
          suggestion: 'Use environment variables or test fixtures',
        });
        break;
      }
    }
  });

  // Add issues for missing patterns
  if (!hasMocks && hasRealDependencies) {
    issues.push({
      type: 'missing-mock',
      file: filePath,
      line: 1,
      severity: 'high',
      message: 'Test file has real dependencies but no mocks',
      suggestion: 'Add mocks for all external dependencies',
    });
  }

  if (!hasAssertions) {
    issues.push({
      type: 'no-assertion',
      file: filePath,
      line: 1,
      severity: 'high',
      message: 'Test file has no assertions',
      suggestion: 'Add assertions to verify test behavior',
    });
  }

  if (!hasCleanup && hasRealDependencies) {
    issues.push({
      type: 'no-cleanup',
      file: filePath,
      line: 1,
      severity: 'medium',
      message: 'Test file has real dependencies but no cleanup',
      suggestion: 'Add afterEach/afterAll to clean up resources',
    });
  }

  return issues;
}

// ─── Main Validation Function ──────────────────────────────────────────────

export async function validateTestContext(
  testFiles: string[] = []
): Promise<ContextValidationResult> {
  const allIssues: TestContextIssue[] = [];
  let totalTests = 0;
  let testsWithContextIssues = 0;

  // Find test files if not provided
  if (testFiles.length === 0) {
    testFiles = findTestFiles();
  }

  // Analyze each test file
  for (const file of testFiles) {
    try {
      const fullPath = path.join(process.cwd(), file);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const issues = analyzeTestFile(file, content);

      if (issues.length > 0) {
        testsWithContextIssues++;
        allIssues.push(...issues);
      }

      totalTests++;
    } catch (err) {
      console.error(`Error analyzing ${file}:`, err);
    }
  }

  // Calculate score
  const missingMocks = allIssues.filter(i => i.type === 'missing-mock').length;
  const realDependencies = allIssues.filter(i => i.type === 'real-dependency').length;
  const noAssertions = allIssues.filter(i => i.type === 'no-assertion').length;
  const noCleanup = allIssues.filter(i => i.type === 'no-cleanup').length;

  const totalIssues = missingMocks + realDependencies + noAssertions + noCleanup;
  const score = totalTests > 0
    ? Math.max(0, 100 - (totalIssues * 10) - (testsWithContextIssues * 5))
    : 100;

  return {
    score,
    issues: allIssues,
    summary: {
      totalTests,
      testsWithContextIssues,
      missingMocks,
      realDependencies,
      noAssertions,
      noCleanup,
    },
  };
}

// ─── Helper to Find Test Files ─────────────────────────────────────────────

function findTestFiles(): string[] {
  const testPatterns = [
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

  for (const pattern of testPatterns) {
    try {
      // Simple glob implementation
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
      // Ignore errors in file finding
    }
  }

  return [...new Set(files)];
}

// ─── Gate Evaluation ───────────────────────────────────────────────────────

export interface ContextGateResult {
  passed: boolean;
  score: number;
  threshold: number;
  issueCount: number;
  details: string;
}

export function evaluateContextGate(
  validationResult: ContextValidationResult,
  threshold: number = 70
): ContextGateResult {
  const passed = validationResult.score >= threshold;

  return {
    passed,
    score: validationResult.score,
    threshold,
    issueCount: validationResult.issues.length,
    details: passed
      ? `Context validation passed: ${validationResult.score}% tests have proper context`
      : `Context validation failed: ${validationResult.score}% tests have proper context (${validationResult.issues.length} issues)`,
  };
}
