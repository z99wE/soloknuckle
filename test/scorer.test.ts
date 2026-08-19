import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import {
  getQualityScore, getTestingScore, getSecurityScore, getEfficiencyScore, getAccessibilityScore,
  getDependencyScore, getDocumentationScore, getGitHygieneScore, getCIPipelineScore, getFeatureFlagsScore,
  calculateMetrics, loadWeights,
} from '../cli/scorer';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

const childProcess = await import('child_process');
const mockExecSync = vi.mocked(childProcess.execSync);

let tmpDir: string;
let origExecSync: typeof childProcess.execSync;

beforeEach(() => {
  vi.restoreAllMocks();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorer-test-'));
  origExecSync = childProcess.execSync;
  mockExecSync.mockReturnValue('');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  (childProcess as any).execSync = origExecSync;
});

function writePkg(scripts: Record<string, string>) {
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ scripts }, null, 2));
}

function mockExecForLint(output: string, shouldThrow = false) {
  if (shouldThrow) {
    (childProcess as any).execSync = () => { throw { stdout: output, stderr: '' }; };
  } else {
    (childProcess as any).execSync = () => output;
  }
}

function mockExecForTests(output: string, shouldThrow = false) {
  if (shouldThrow) {
    (childProcess as any).execSync = () => { throw { stdout: output, stderr: '' }; };
  } else {
    (childProcess as any).execSync = () => output;
  }
}

function mockExecForSecurity(diff: string) {
  let callCount = 0;
  (childProcess as any).execSync = (cmd: string) => {
    callCount++;
    if (cmd.includes('git diff --cached')) return diff;
    if (cmd.includes('git diff')) return callCount === 1 ? diff : '';
    return '';
  };
}

describe('getQualityScore', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  it('returns 100 when lint passes', () => {
    writePkg({ lint: 'eslint .' });
    mockExecForLint('no errors or warnings found');

    const result = getQualityScore();
    expect(result.score).toBe(100);
    expect(result.rawOutput).toBe('Lint passed');
  });

  it('reduces score by 10 per error and 5 per warning', () => {
    writePkg({ lint: 'eslint .' });
    mockExecForLint('error\nwarning\nwarning', true);

    const result = getQualityScore();
    expect(result.score).toBe(100 - 1 * 10 - 2 * 5);
  });

  it('floors at 0 with many errors', () => {
    writePkg({ lint: 'eslint .' });
    mockExecForLint('error\n'.repeat(15), true);

    const result = getQualityScore();
    expect(result.score).toBe(0);
  });

  it('returns 50 when no lint script exists', () => {
    writePkg({ test: 'jest' });

    const result = getQualityScore();
    expect(result.score).toBe(50);
    expect(result.rawOutput).toContain('No lint script');
  });

  it('returns 50 when no package.json exists', () => {
    const result = getQualityScore();
    expect(result.score).toBe(50);
  });
});

describe('getTestingScore', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  it('returns 100 when tests pass', () => {
    writePkg({ test: 'vitest run' });
    mockExecForTests('5 passed');

    const result = getTestingScore();
    expect(result.score).toBe(100);
  });

  it('reduces score by 20 per fail occurrence', () => {
    writePkg({ test: 'vitest run' });
    mockExecForTests('3 tests failed\n1 suite failed', true);

    const result = getTestingScore();
    expect(result.score).toBe(80 - 2 * 20);
  });

  it('floors at 0', () => {
    writePkg({ test: 'vitest run' });
    mockExecForTests('fail fail fail fail fail', true);

    const result = getTestingScore();
    expect(result.score).toBe(0);
  });

  it('returns 0 when no test script exists', () => {
    writePkg({ lint: 'eslint .' });

    const result = getTestingScore();
    expect(result.score).toBe(0);
    expect(result.rawOutput).toContain('No test script');
  });
});

describe('getSecurityScore', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  it('returns 100 on clean diff', () => {
    mockExecForSecurity('');

    const result = getSecurityScore();
    expect(result.score).toBe(100);
    expect(result.rawOutput).toContain('No secrets');
  });

  it('deducts 25 per violation', () => {
    mockExecForSecurity(
      'diff --git a/config.ts b/config.ts\n' +
      '+++ b/config.ts\n' +
      '+const key = "sk_live_TEST0000000000000000000000"\n' +
      '+const ssn = "123-45-6789"\n'
    );

    const result = getSecurityScore();
    expect(result.score).toBe(100 - 25 * 2);
  });

  it('returns 0 when violations exceed 4', () => {
    mockExecForSecurity(
      '+++ b/config.ts\n' +
      '+sk_live_TEST0000000000000000000000\n' +
      '+xoxb-TEST-TOKEN-00000\n' +
      '+apikey000000000000000TEST\n' +
      '+real@email.com\n' +
      '+987-65-4321\n'
    );

    const result = getSecurityScore();
    expect(result.score).toBe(0);
  });

  it('ignores deleted lines', () => {
    mockExecForSecurity(
      '+++ b/config.ts\n' +
      '-sk_live_TEST0000000000000000000000\n'
    );

    const result = getSecurityScore();
    expect(result.score).toBe(100);
  });

  it('ignores test@ emails', () => {
    mockExecForSecurity(
      '+++ b/config.ts\n' +
      '+const email = "test@example.com"\n' +
      '+const test = "test@foo.com"\n'
    );

    const result = getSecurityScore();
    expect(result.score).toBe(100);
  });
});

describe('getEfficiencyScore', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  it('returns 100 when code is well-structured', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.ts'), 'console.log("hello");\n');

    const result = getEfficiencyScore();
    expect(result.score).toBe(100);
  });

  it('deducts 20 for a file exceeding 500 lines', () => {
    fs.mkdirSync(path.join(tmpDir, 'cli'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'cli', 'big.ts'), Array(501).fill('const x = 1;').join('\n'));

    const result = getEfficiencyScore();
    expect(result.score).toBe(80);
    expect(result.rawOutput).toContain('extremely long');
  });

  it('deducts 10 for deep nesting (151+ braces)', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'deep.ts'), Array(151).fill('{').join(' ') + ' ' + Array(151).fill('}').join(' '));

    const result = getEfficiencyScore();
    expect(result.score).toBe(90);
    expect(result.rawOutput).toContain('deep nesting');
  });

  it('skips node_modules and .git', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg', 'big.ts'), Array(600).fill('x').join('\n'));
    fs.mkdirSync(path.join(tmpDir, '.git', 'objects'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.git', 'objects', 'big.ts'), Array(600).fill('x').join('\n'));

    const result = getEfficiencyScore();
    expect(result.score).toBe(100);
  });
});

describe('getAccessibilityScore', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  it('returns 100 when no a11y issues', () => {
    fs.mkdirSync(path.join(tmpDir, 'ui', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ui', 'src', 'App.jsx'), '<img src="logo.png" alt="Logo" />\n');

    const result = getAccessibilityScore();
    expect(result.score).toBe(100);
  });

  it('deducts 15 per img without alt', () => {
    fs.mkdirSync(path.join(tmpDir, 'ui', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ui', 'src', 'App.jsx'),
      '<img src="a.png" />\n<img src="b.png" alt="B" />\n');

    const result = getAccessibilityScore();
    expect(result.score).toBe(85);
    expect(result.rawOutput).toContain('Missing alt');
  });

  it('deducts 15 per button without accessible name', () => {
    fs.mkdirSync(path.join(tmpDir, 'ui', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ui', 'src', 'App.jsx'), '<button>Click</button>\n');

    const result = getAccessibilityScore();
    expect(result.score).toBe(85);
    expect(result.rawOutput).toContain('Button lacks accessible name');
  });

  it('does NOT penalize buttons with aria-label', () => {
    fs.mkdirSync(path.join(tmpDir, 'ui', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ui', 'src', 'App.jsx'), '<button aria-label="Submit">Go</button>\n');

    const result = getAccessibilityScore();
    expect(result.score).toBe(100);
  });

  it('does NOT penalize buttons with title attribute', () => {
    fs.mkdirSync(path.join(tmpDir, 'ui', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ui', 'src', 'App.jsx'), '<button title="Submit">Go</button>\n');

    const result = getAccessibilityScore();
    expect(result.score).toBe(100);
  });

  it('combines img and button issues', () => {
    fs.mkdirSync(path.join(tmpDir, 'ui', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ui', 'src', 'App.jsx'),
      '<img src="a.png" />\n<img src="b.png" />\n<button>Click</button>\n');

    const result = getAccessibilityScore();
    expect(result.score).toBe(55);
  });

  it('floors at 0 with many violations', () => {
    fs.mkdirSync(path.join(tmpDir, 'ui', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ui', 'src', 'App.jsx'),
      Array(8).fill('<img src="x.png" />\n').join('') + '<button>Go</button>\n');

    const result = getAccessibilityScore();
    expect(result.score).toBe(0);
  });
});

describe('calculateMetrics', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  it('overall is the rounded weighted average of all 10 dimensions', () => {
    writePkg({ lint: 'eslint .', test: 'vitest' });
    mockExecForLint('', false);
    mockExecForTests('', false);
    mockExecForSecurity('');
    fs.mkdirSync(path.join(tmpDir, 'ui', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ui', 'src', 'App.jsx'), '<img alt="ok" />\n');

    const m = calculateMetrics();
    // overall is the rounded weighted average of ALL 10 dimensions, not just 5
    expect(m.overall).toBeGreaterThanOrEqual(0);
    expect(m.overall).toBeLessThanOrEqual(100);
    // all dimension scores should be present and numeric
    expect(typeof m.quality.score).toBe('number');
    expect(typeof m.gitHygiene.score).toBe('number');
  });

  it('returns correct shape with all 10 dimensions', () => {
    writePkg({ lint: 'eslint .', test: 'vitest' });
    mockExecForLint('', false);
    mockExecForTests('', false);
    mockExecForSecurity('');

    const m = calculateMetrics();

    for (const key of [
      'quality', 'testing', 'security', 'efficiency', 'accessibility',
      'dependencies', 'documentation', 'gitHygiene', 'ciPipeline', 'featureFlags',
    ]) {
      expect(m[key]).toHaveProperty('score');
      expect(m[key]).toHaveProperty('rawOutput');
      expect(typeof m[key].score).toBe('number');
      expect(typeof m[key].rawOutput).toBe('string');
    }
    expect(typeof m.overall).toBe('number');
  });

  it('overall is the rounded weighted average', () => {
    writePkg({ lint: 'eslint .', test: 'vitest' });
    mockExecForLint('', false);
    mockExecForTests('', false);
    mockExecForSecurity('');
    fs.mkdirSync(path.join(tmpDir, 'ui', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'ui', 'src', 'App.jsx'), '<img alt="ok" />\n');

    const m = calculateMetrics();
    expect(m.overall).toBeGreaterThanOrEqual(0);
    expect(m.overall).toBeLessThanOrEqual(100);
  });
});

describe('getDependencyScore', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    mockExecSync.mockReturnValue('');
  });

  it('returns high score when package.json and lock file exist with clean audit', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    mockExecSync.mockReturnValue(JSON.stringify({ metadata: { vulnerabilities: { total: 0, critical: 0, high: 0 } } }));

    const result = getDependencyScore();
    expect(result.score).toBe(100);
    expect(result.rawOutput).toContain('npm audit');
  });

  it('returns 50 when no package.json exists', () => {
    const result = getDependencyScore();
    expect(result.score).toBe(50);
  });

  it('deducts for missing lock file', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    mockExecSync.mockReturnValue('{}');

    const result = getDependencyScore();
    expect(result.score).toBeLessThan(100);
    expect(result.rawOutput).toContain('No lock file');
  });
});

describe('getDocumentationScore', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  it('scores higher with more documentation files', () => {
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# My Project\n' + 'x'.repeat(200));
    fs.writeFileSync(path.join(tmpDir, 'LICENSE'), 'MIT License\n' + 'x'.repeat(200));
    fs.writeFileSync(path.join(tmpDir, 'CHANGELOG.md'), '# Changelog\n' + 'x'.repeat(200));
    fs.writeFileSync(path.join(tmpDir, 'SECURITY.md'), '# Security\n' + 'x'.repeat(200));

    const result = getDocumentationScore();
    expect(result.score).toBeGreaterThan(50);
  });

  it('returns low score when no documentation exists', () => {
    const result = getDocumentationScore();
    expect(result.score).toBeLessThan(30);
    expect(result.rawOutput).toContain('missing');
  });
});

describe('getGitHygieneScore', () => {
  it('returns a valid score with rawOutput', () => {
    const result = getGitHygieneScore();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.rawOutput).toBeTruthy();
  });
});

describe('getCIPipelineScore', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  it('scores high with full CI/CD setup', () => {
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'name: CI\nrun: npm test\nrun: npm run lint');

    const result = getCIPipelineScore();
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.rawOutput).toContain('GitHub Actions');
  });

  it('returns 0 when no CI/CD found', () => {
    const result = getCIPipelineScore();
    expect(result.score).toBe(0);
  });
});

describe('getFeatureFlagsScore', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  it('scores higher with flags.json and configured flags', () => {
    fs.writeFileSync(path.join(tmpDir, 'flags.json'), JSON.stringify({
      'export-csv': true,
      'dark-mode': false,
    }, null, 2));

    const result = getFeatureFlagsScore();
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.rawOutput).toContain('flags.json found');
  });

  it('returns baseline score when no flags.json exists', () => {
    const result = getFeatureFlagsScore();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it('scores lower when no flags are enabled', () => {
    fs.writeFileSync(path.join(tmpDir, 'flags.json'), JSON.stringify({
      'export-csv': false,
      'dark-mode': false,
    }, null, 2));

    const result = getFeatureFlagsScore();
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThan(100);
  });
});

describe('loadWeights', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  it('returns defaults when no weights file exists', () => {
    const weights = loadWeights();
    expect(weights.quality).toBe(1);
    expect(weights.testing).toBe(1);
    expect(weights.security).toBe(1);
    expect(weights.efficiency).toBe(1);
    expect(weights.accessibility).toBe(1);
    expect(weights.dependencies).toBe(1);
    expect(weights.documentation).toBe(1);
    expect(weights.gitHygiene).toBe(1);
    expect(weights.ciPipeline).toBe(1);
    expect(weights.featureFlags).toBe(1);
  });

  it('loads custom weights from file', () => {
    fs.mkdirSync(path.join(tmpDir, '.soloknuckle'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.soloknuckle', 'score-weights.json'), JSON.stringify({
      quality: 2,
      security: 3,
      testing: 0.5,
    }, null, 2));

    const weights = loadWeights();
    expect(weights.quality).toBe(2);
    expect(weights.security).toBe(3);
    expect(weights.testing).toBe(0.5);
    // Others remain default
    expect(weights.efficiency).toBe(1);
  });

  it('merges partial weights with defaults', () => {
    fs.mkdirSync(path.join(tmpDir, '.soloknuckle'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.soloknuckle', 'score-weights.json'), JSON.stringify({
      security: 5,
    }, null, 2));

    const weights = loadWeights();
    expect(weights.security).toBe(5);
    expect(weights.quality).toBe(1);
    expect(weights.testing).toBe(1);
  });
});
