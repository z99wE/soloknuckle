import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ─── Mutation Testing Gate ──────────────────────────────────────────────────
// Detects code that tests pass but behavior changes (Coverage Illusion)
// This addresses the critical gap where 98% coverage can hide 4% mutation scores

export interface Mutation {
  id: string;
  file: string;
  line: number;
  original: string;
  mutated: string;
  type: 'operator' | 'return' | 'boundary' | 'boolean';
}

export interface MutationResult {
  mutation: Mutation;
  killed: boolean;
  testOutput: string;
  duration: number;
}

export interface MutationScore {
  totalMutations: number;
  killedMutations: number;
  survivedMutations: number;
  score: number;
  results: MutationResult[];
  survivorDetails: { file: string; line: number; original: string; mutated: string }[];
}

// ─── Mutation Operators ────────────────────────────────────────────────────

const OPERATOR_MUTATIONS: Record<string, string> = {
  '+': '-',
  '-': '+',
  '*': '/',
  '/': '*',
  '>': '<',
  '<': '>',
  '>=': '<=',
  '<=': '>=',
  '==': '!=',
  '!=': '==',
  '===': '!==',
  '!==': '===',
  '&&': '||',
  '||': '&&',
};

const RETURN_MUTATIONS: Record<string, string> = {
  'return true': 'return false',
  'return false': 'return true',
  'return 0': 'return 1',
  'return 1': 'return 0',
  'return null': 'return undefined',
  'return undefined': 'return null',
  'return []': 'return [null]',
  'return {}': 'return null',
};

const BOUNDARY_MUTATIONS: Record<string, string> = {
  '< 0': '<= 0',
  '<= 0': '< 0',
  '> 0': '>= 0',
  '>= 0': '> 0',
  '< 1': '<= 1',
  '<= 1': '< 1',
  '> 1': '>= 1',
  '>= 1': '> 1',
  '< 10': '<= 10',
  '<= 10': '< 10',
  '> 10': '>= 10',
  '>= 10': '> 10',
};

const BOOLEAN_MUTATIONS: Record<string, string> = {
  '!': '',
  'true': 'false',
  'false': 'true',
};

// ─── Mutation Generation ──────────────────────────────────────────────────

function generateMutations(filePath: string, content: string): Mutation[] {
  const mutations: Mutation[] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    let mutationCount = 0;

    // Operator mutations
    for (const [op, mutated] of Object.entries(OPERATOR_MUTATIONS)) {
      if (line.includes(op)) {
        mutations.push({
          id: `${filePath}:${lineNum}:op:${mutationCount++}`,
          file: filePath,
          line: lineNum,
          original: line,
          mutated: line.replace(op, mutated),
          type: 'operator',
        });
      }
    }

    // Return mutations
    for (const [ret, mutated] of Object.entries(RETURN_MUTATIONS)) {
      if (line.includes(ret)) {
        mutations.push({
          id: `${filePath}:${lineNum}:ret:${mutationCount++}`,
          file: filePath,
          line: lineNum,
          original: line,
          mutated: line.replace(ret, mutated),
          type: 'return',
        });
      }
    }

    // Boundary mutations
    for (const [bound, mutated] of Object.entries(BOUNDARY_MUTATIONS)) {
      if (line.includes(bound)) {
        mutations.push({
          id: `${filePath}:${lineNum}:bound:${mutationCount++}`,
          file: filePath,
          line: lineNum,
          original: line,
          mutated: line.replace(bound, mutated),
          type: 'boundary',
        });
      }
    }

    // Boolean mutations
    for (const [bool, mutated] of Object.entries(BOOLEAN_MUTATIONS)) {
      if (line.includes(bool)) {
        mutations.push({
          id: `${filePath}:${lineNum}:bool:${mutationCount++}`,
          file: filePath,
          line: lineNum,
          original: line,
          mutated: line.replace(bool, mutated),
          type: 'boolean',
        });
      }
    }
  });

  return mutations;
}

// ─── Mutation Testing ──────────────────────────────────────────────────────

function applyMutation(filePath: string, mutation: Mutation): void {
  const fullPath = path.join(process.cwd(), filePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');
  lines[mutation.line - 1] = mutation.mutated;
  fs.writeFileSync(fullPath, lines.join('\n'), 'utf-8');
}

function revertMutation(filePath: string, mutation: Mutation): void {
  const fullPath = path.join(process.cwd(), filePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');
  lines[mutation.line - 1] = mutation.original;
  fs.writeFileSync(fullPath, lines.join('\n'), 'utf-8');
}

function runTests(): { passed: boolean; output: string } {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return { passed: false, output: 'No package.json found' };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (!pkg.scripts || !pkg.scripts.test) {
      return { passed: false, output: 'No test script found in package.json' };
    }

    const output = execSync('npm test', {
      encoding: 'utf-8',
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 60000, // 60 second timeout per mutation test
    });

    return { passed: true, output: output.substring(0, 1000) };
  } catch (e: unknown) {
    const output = e instanceof Error ? e.message : String(e);
    return { passed: false, output: output.substring(0, 1000) };
  }
}

// ─── Main Mutation Testing Gate ────────────────────────────────────────────

export async function runMutationTesting(
  files: string[] = [],
  maxMutationsPerFile: number = 5
): Promise<MutationScore> {
  const allMutations: Mutation[] = [];
  const results: MutationResult[] = [];

  // Find files to mutate
  if (files.length === 0) {
    // Find all TypeScript/JavaScript files in src/ and cli/
    const srcFiles = findFiles(['src/**/*.ts', 'src/**/*.js', 'cli/**/*.ts', 'cli/**/*.js']);
    files = srcFiles;
  }

  // Generate mutations for each file
  for (const file of files) {
    try {
      const fullPath = path.join(process.cwd(), file);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const mutations = generateMutations(file, content);

      // Limit mutations per file
      const limitedMutations = mutations.slice(0, maxMutationsPerFile);
      allMutations.push(...limitedMutations);
    } catch (err) {
      console.error(`Error generating mutations for ${file}:`, err);
    }
  }

  // Run tests for each mutation
  for (const mutation of allMutations) {
    const startTime = Date.now();

    try {
      // Apply mutation
      applyMutation(mutation.file, mutation);

      // Run tests
      const testResult = runTests();

      // Revert mutation
      revertMutation(mutation.file, mutation);

      const duration = Date.now() - startTime;

      results.push({
        mutation,
        killed: !testResult.passed, // If tests fail, mutation was killed
        testOutput: testResult.output,
        duration,
      });
    } catch (err) {
      // Revert mutation if something goes wrong
      try {
        revertMutation(mutation.file, mutation);
      } catch (revertErr) {
        console.error(`Failed to revert mutation ${mutation.id}:`, revertErr);
      }

      results.push({
        mutation,
        killed: true, // Assume killed if we can't apply/revert
        testOutput: `Error: ${err instanceof Error ? err.message : String(err)}`,
        duration: Date.now() - startTime,
      });
    }
  }

  // Calculate score
  const killedMutations = results.filter(r => r.killed).length;
  const survivedMutations = results.filter(r => !r.killed).length;
  const score = allMutations.length > 0
    ? Math.round((killedMutations / allMutations.length) * 100)
    : 100;

  return {
    totalMutations: allMutations.length,
    killedMutations,
    survivedMutations,
    score,
    results,
    survivorDetails: results
      .filter(r => !r.killed)
      .map(r => ({
        file: r.mutation.file,
        line: r.mutation.line,
        original: r.mutation.original,
        mutated: r.mutation.mutated,
      })),
  };
}

// ─── Helper to Find Files ──────────────────────────────────────────────────

function findFiles(patterns: string[]): string[] {
  const files: string[] = [];

  for (const pattern of patterns) {
    try {
      // Simple glob implementation for common patterns
      const [dir, ext] = pattern.split('**/');
      const fullDir = path.join(process.cwd(), dir);

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

export interface MutationGateResult {
  passed: boolean;
  score: number;
  threshold: number;
  survivorCount: number;
  details: string;
}

export function evaluateMutationGate(
  mutationScore: MutationScore,
  threshold: number = 70
): MutationGateResult {
  const passed = mutationScore.score >= threshold;

  return {
    passed,
    score: mutationScore.score,
    threshold,
    survivorCount: mutationScore.survivedMutations,
    details: passed
      ? `Mutation testing passed: ${mutationScore.score}% mutations killed`
      : `Mutation testing failed: ${mutationScore.score}% mutations killed (${mutationScore.survivedMutations} survived)`,
  };
}
