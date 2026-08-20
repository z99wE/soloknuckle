import fs from 'fs';
import path from 'path';

// ─── Caller Contract Checker ───────────────────────────────────────────────
// Verifies tests match actual function signatures (No Context Awareness)
// This addresses the critical gap where tests pass in isolation but fail
// when the actual function signature changes or when called from real code

export interface ContractViolation {
  type: 'signature-mismatch' | 'missing-parameter' | 'extra-parameter' | 'type-mismatch' | 'return-type-mismatch';
  testFile: string;
  sourceFile: string;
  function: string;
  line: number;
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

export interface ContractValidationResult {
  score: number;
  violations: ContractViolation[];
  summary: {
    totalFunctions: number;
    functionsWithViolations: number;
    signatureMismatches: number;
    missingParameters: number;
    extraParameters: number;
    typeMismatches: number;
  };
}

// ─── Function Signature Extraction ─────────────────────────────────────────

interface FunctionSignature {
  name: string;
  parameters: { name: string; type?: string; optional?: boolean }[];
  returnType?: string;
  file: string;
  line: number;
}

function extractFunctionSignatures(filePath: string, content: string): FunctionSignature[] {
  const signatures: FunctionSignature[] = [];
  const lines = content.split('\n');

  // Match function declarations and exports
  const functionPatterns = [
    // export function name(params)
    /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
    // export const name = (params) =>
    /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*:/g,
    // export const name = function(params)
    /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)/g,
    // function name(params)
    /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
    // const name = (params) =>
    /const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*:/g,
  ];

  lines.forEach((line, index) => {
    for (const pattern of functionPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const name = match[1];
        const paramsStr = match[2];

        // Parse parameters
        const parameters = paramsStr.split(',').map(param => {
          const trimmed = param.trim();
          if (!trimmed) return null;

          const [namePart, typePart] = trimmed.split(':').map(s => s.trim());
          const optional = namePart.includes('?');

          return {
            name: namePart.replace('?', ''),
            type: typePart,
            optional,
          };
        }).filter(Boolean) as { name: string; type?: string; optional?: boolean }[];

        // Extract return type
        const returnMatch = line.match(/:\s*([A-Z]\w+(?:\[\])?|void|null|undefined|boolean|number|string|any)\s*[{=]/);
        const returnType = returnMatch ? returnMatch[1] : undefined;

        signatures.push({
          name,
          parameters,
          returnType,
          file: filePath,
          line: index + 1,
        });
      }
    }
  });

  return signatures;
}

// ─── Test File Analysis ────────────────────────────────────────────────────

function analyzeTestFileForContracts(
  testFilePath: string,
  testContent: string,
  sourceSignatures: FunctionSignature[]
): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const lines = testContent.split('\n');

  // Find function calls in test file
  const functionCallPattern = /(\w+)\s*\(([^)]*)\)/g;

  lines.forEach((line, index) => {
    let match;
    while ((match = functionCallPattern.exec(line)) !== null) {
      const functionName = match[1];
      const argsStr = match[2];

      // Find matching source function
      const sourceFunc = sourceSignatures.find(s => s.name === functionName);
      if (!sourceFunc) continue;

      // Parse test arguments
      const testArgs = argsStr.split(',').map(arg => arg.trim()).filter(arg => arg !== '');

      // Check parameter count
      const requiredParams = sourceFunc.parameters.filter(p => !p.optional);
      const totalParams = sourceFunc.parameters.length;

      if (testArgs.length < requiredParams.length) {
        violations.push({
          type: 'missing-parameter',
          testFile: testFilePath,
          sourceFile: sourceFunc.file,
          function: functionName,
          line: index + 1,
          severity: 'high',
          message: `Test calls ${functionName} with ${testArgs.length} arguments, but it requires at least ${requiredParams.length}`,
          suggestion: `Add missing parameters: ${sourceFunc.parameters.slice(testArgs.length).map(p => p.name).join(', ')}`,
        });
      }

      if (testArgs.length > totalParams) {
        violations.push({
          type: 'extra-parameter',
          testFile: testFilePath,
          sourceFile: sourceFunc.file,
          function: functionName,
          line: index + 1,
          severity: 'medium',
          message: `Test calls ${functionName} with ${testArgs.length} arguments, but it only accepts ${totalParams}`,
          suggestion: `Remove extra arguments or update function signature`,
        });
      }

      // Check parameter types (simplified)
      sourceFunc.parameters.forEach((param, paramIndex) => {
        if (paramIndex >= testArgs.length) return;

        const testArg = testArgs[paramIndex];
        if (!param.type) return;

        // Basic type checking
        const typeMismatch = checkTypeMismatch(testArg, param.type);
        if (typeMismatch) {
          violations.push({
            type: 'type-mismatch',
            testFile: testFilePath,
            sourceFile: sourceFunc.file,
            function: functionName,
            line: index + 1,
            severity: 'medium',
            message: `Parameter ${param.name} expects ${param.type}, but test provides ${typeMismatch}`,
            suggestion: `Update test to use correct type for ${param.name}`,
          });
        }
      });
    }
  });

  return violations;
}

// ─── Type Checking Helpers ─────────────────────────────────────────────────

function checkTypeMismatch(arg: string, expectedType: string): string | null {
  const trimmedArg = arg.trim();

  // Check for obvious type mismatches
  if (expectedType === 'string' && /^\d+$/.test(trimmedArg)) {
    return 'number';
  }

  if (expectedType === 'number' && /^['"]/.test(trimmedArg)) {
    return 'string';
  }

  if (expectedType === 'boolean' && trimmedArg !== 'true' && trimmedArg !== 'false') {
    return 'other';
  }

  return null;
}

// ─── Main Contract Validation ──────────────────────────────────────────────

export async function validateCallerContracts(
  testFiles: string[] = [],
  sourceFiles: string[] = []
): Promise<ContractValidationResult> {
  const allViolations: ContractViolation[] = [];
  let totalFunctions = 0;
  let functionsWithViolations = 0;

  // Find source files if not provided
  if (sourceFiles.length === 0) {
    sourceFiles = findSourceFiles();
  }

  // Find test files if not provided
  if (testFiles.length === 0) {
    testFiles = findTestFiles();
  }

  // Extract function signatures from source files
  const allSignatures: FunctionSignature[] = [];
  for (const file of sourceFiles) {
    try {
      const fullPath = path.join(process.cwd(), file);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const signatures = extractFunctionSignatures(file, content);
      allSignatures.push(...signatures);
      totalFunctions += signatures.length;
    } catch (err) {
      console.error(`Error extracting signatures from ${file}:`, err);
    }
  }

  // Analyze test files for contract violations
  const analyzedFunctions = new Set<string>();
  for (const file of testFiles) {
    try {
      const fullPath = path.join(process.cwd(), file);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf-8');
      const violations = analyzeTestFileForContracts(file, content, allSignatures);

      if (violations.length > 0) {
        functionsWithViolations++;
        allViolations.push(...violations);
      }

      // Track unique functions
      violations.forEach(v => analyzedFunctions.add(v.function));
    } catch (err) {
      console.error(`Error analyzing ${file}:`, err);
    }
  }

  // Calculate score
  const signatureMismatches = allViolations.filter(v => v.type === 'signature-mismatch').length;
  const missingParameters = allViolations.filter(v => v.type === 'missing-parameter').length;
  const extraParameters = allViolations.filter(v => v.type === 'extra-parameter').length;
  const typeMismatches = allViolations.filter(v => v.type === 'type-mismatch').length;

  const totalViolations = signatureMismatches + missingParameters + extraParameters + typeMismatches;
  const score = totalFunctions > 0
    ? Math.max(0, 100 - (totalViolations * 10) - (functionsWithViolations * 5))
    : 100;

  return {
    score,
    violations: allViolations,
    summary: {
      totalFunctions,
      functionsWithViolations,
      signatureMismatches,
      missingParameters,
      extraParameters,
      typeMismatches,
    },
  };
}

// ─── Helper to Find Files ──────────────────────────────────────────────────

function findSourceFiles(): string[] {
  const patterns = ['src/**/*.ts', 'src/**/*.js', 'cli/**/*.ts', 'cli/**/*.js'];
  const files: string[] = [];

  for (const pattern of patterns) {
    try {
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
      // Ignore errors
    }
  }

  return [...new Set(files)];
}

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

export interface ContractGateResult {
  passed: boolean;
  score: number;
  threshold: number;
  violationCount: number;
  details: string;
}

export function evaluateContractGate(
  validationResult: ContractValidationResult,
  threshold: number = 70
): ContractGateResult {
  const passed = validationResult.score >= threshold;

  return {
    passed,
    score: validationResult.score,
    threshold,
    violationCount: validationResult.violations.length,
    details: passed
      ? `Contract validation passed: ${validationResult.score}% functions have correct contracts`
      : `Contract validation failed: ${validationResult.score}% functions have correct contracts (${validationResult.violations.length} violations)`,
  };
}
