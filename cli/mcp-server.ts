#!/usr/bin/env node

import { calculateMetrics, generateSuggestions } from './scorer';
import { getTelemetry } from './telemetry';
import { interceptCommand } from './interceptor';
import { scanDiffForSecretsAndPII } from './scanner';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const TOOLS = [
  {
    name: 'soloknuckle_score',
    description: 'Get the full production hygiene score for the current project. Returns overall score (0-100) and per-category breakdowns for quality, testing, security, efficiency, and accessibility.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'soloknuckle_telemetry',
    description: 'Get AI vs human contribution telemetry. Shows how many commits and lines were written by AI vs humans.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'soloknuckle_intercept',
    description: 'Check if a shell command is safe or destructive. Returns whether the command would be blocked by the firewall and why.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'The shell command to check' },
      },
      required: ['command'],
    },
  },
  {
    name: 'soloknuckle_secrets',
    description: 'Scan a git diff for secrets, API keys, tokens, and PII. Pass empty string to scan staged/unstaged diff.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        diff: { type: 'string', description: 'The diff text to scan. Empty string scans the current git diff.' },
      },
      required: ['diff'],
    },
  },
  {
    name: 'soloknuckle_flags',
    description: 'Read the current feature flags from flags.json. Returns all flags and their enabled/disabled state.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'soloknuckle_flag_set',
    description: 'Enable or disable a feature flag in flags.json.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'The flag name' },
        enabled: { type: 'boolean', description: 'true to enable, false to disable' },
      },
      required: ['name', 'enabled'],
    },
  },
  {
    name: 'soloknuckle_suggest',
    description: 'Use AI to generate improvement suggestions based on the current score metrics. Requires an active LLM provider configured.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'soloknuckle_branches',
    description: 'List local git branches and their status.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
];

function handleRequest(req: MCPRequest): MCPResponse {
  switch (req.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'soloknuckle', version: '1.0.0' },
        },
      };

    case 'notifications/initialized':
      return { jsonrpc: '2.0', id: req.id, result: {} };

    case 'tools/list':
      return { jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } };

    case 'tools/call': {
      const params = req.params as { name: string; arguments: Record<string, unknown> } | undefined;
      if (!params) {
        return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'Missing params' } };
      }
      return handleToolCall(req.id, params.name, params.arguments || {});
    }

    default:
      return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Unknown method: ${req.method}` } };
  }
}

function handleToolCall(id: number | string, name: string, args: Record<string, unknown>): MCPResponse {
  try {
    let result: unknown;

    switch (name) {
      case 'soloknuckle_score': {
        const metrics = calculateMetrics();
        result = {
          overall: metrics.overall,
          quality: metrics.quality.score,
          testing: metrics.testing.score,
          security: metrics.security.score,
          efficiency: metrics.efficiency.score,
          accessibility: metrics.accessibility.score,
          details: {
            quality: metrics.quality.rawOutput,
            testing: metrics.testing.rawOutput,
            security: metrics.security.rawOutput,
            efficiency: metrics.efficiency.rawOutput,
            accessibility: metrics.accessibility.rawOutput,
          },
        };
        break;
      }

      case 'soloknuckle_telemetry': {
        result = getTelemetry();
        break;
      }

      case 'soloknuckle_intercept': {
        const command = String(args.command || '');
        const outcome = interceptCommand(command);
        result = { blocked: outcome.blocked, reason: outcome.reason || null };
        break;
      }

      case 'soloknuckle_secrets': {
        const diff = String(args.diff || '');
        let diffToScan = diff;
        if (!diff) {
          try {
            execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: process.cwd() });
            diffToScan = execSync('git diff --cached', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
            if (!diffToScan) {
              diffToScan = execSync('git diff', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
            }
          } catch {
            diffToScan = '';
          }
        }
        const violations = scanDiffForSecretsAndPII(diffToScan);
        result = { clean: violations.length === 0, violations };
        break;
      }

      case 'soloknuckle_flags': {
        const flagsPath = path.join(process.cwd(), 'flags.json');
        if (fs.existsSync(flagsPath)) {
          result = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
        } else {
          result = {};
        }
        break;
      }

      case 'soloknuckle_flag_set': {
        const flagName = String(args.name || '');
        const enabled = Boolean(args.enabled);
        if (!flagName) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing flag name' } };
        }
        const flagsPath = path.join(process.cwd(), 'flags.json');
        let flags: Record<string, boolean> = {};
        if (fs.existsSync(flagsPath)) {
          flags = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
        }
        flags[flagName] = enabled;
        fs.writeFileSync(flagsPath, JSON.stringify(flags, null, 2));
        result = { success: true, flag: flagName, enabled };
        break;
      }

      case 'soloknuckle_suggest': {
        const metrics = calculateMetrics();
        result = generateSuggestions(metrics);
        break;
      }

      case 'soloknuckle_branches': {
        try {
          execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: process.cwd() });
          const output = execSync('git branch', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
          const branches = output.split('\n')
            .filter(line => line.trim())
            .map(line => ({
              name: line.replace(/^\*?\s*/, '').trim(),
              current: line.startsWith('*'),
            }));
          result = branches;
        } catch {
          result = [];
        }
        break;
      }

      default:
        return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name}` } };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      },
    };
  }
}

function main() {
  let buffer = '';

  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const req = JSON.parse(trimmed) as MCPRequest;
        const res = handleRequest(req);
        process.stdout.write(JSON.stringify(res) + '\n');
      } catch {
        // Ignore non-JSON lines (MCP uses JSON-RPC, invalid JSON is skipped)
      }
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}

// Run if executed directly (not imported for tests)
if (require.main === module) {
  main();
}

export { handleRequest, TOOLS, main };
