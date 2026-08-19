import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('../cli/llm-client', () => ({
  callLLM: vi.fn().mockResolvedValue('["Add tests for critical paths"]'),
}));

vi.mock('../cli/scorer', () => ({
  calculateMetrics: vi.fn().mockReturnValue({
    overall: 80,
    quality: { score: 90, rawOutput: 'Lint passed' },
    testing: { score: 100, rawOutput: 'All tests passed' },
    security: { score: 70, rawOutput: '2 secrets found' },
    efficiency: { score: 80, rawOutput: 'Code structure OK' },
    accessibility: { score: 60, rawOutput: '2 a11y issues' },
  }),
  generateSuggestions: vi.fn().mockResolvedValue(['Add aria-label to buttons', 'Fix the 2 security issues']),
}));

const { handleRequest, TOOLS } = await import('../cli/mcp-server');

describe('MCP Server', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('returns server info and capabilities', () => {
      const res = handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' });
      expect(res.result).toEqual({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'soloknuckle', version: '1.0.0' },
      });
      expect(res.id).toBe(1);
    });
  });

  describe('tools/list', () => {
    it('returns all registered tools', () => {
      const res = handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const tools = (res.result as { tools: typeof TOOLS }).tools;
      expect(tools.length).toBe(8);
      expect(tools.map(t => t.name)).toContain('soloknuckle_score');
      expect(tools.map(t => t.name)).toContain('soloknuckle_telemetry');
      expect(tools.map(t => t.name)).toContain('soloknuckle_intercept');
      expect(tools.map(t => t.name)).toContain('soloknuckle_secrets');
      expect(tools.map(t => t.name)).toContain('soloknuckle_flags');
      expect(tools.map(t => t.name)).toContain('soloknuckle_flag_set');
      expect(tools.map(t => t.name)).toContain('soloknuckle_suggest');
      expect(tools.map(t => t.name)).toContain('soloknuckle_branches');
    });

    it('each tool has name, description, and inputSchema', () => {
      const res = handleRequest({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
      const tools = (res.result as { tools: typeof TOOLS }).tools;
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeTruthy();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('unknown method', () => {
    it('returns method not found error', () => {
      const res = handleRequest({ jsonrpc: '2.0', id: 4, method: 'unknown/method' });
      expect(res.error).toEqual(
        expect.objectContaining({ code: -32601, message: expect.stringContaining('Unknown method') })
      );
    });
  });

  describe('tools/call - missing params', () => {
    it('returns error when params missing', () => {
      const res = handleRequest({ jsonrpc: '2.0', id: 5, method: 'tools/call' });
      expect(res.error).toEqual(
        expect.objectContaining({ code: -32602 })
      );
    });
  });

  describe('tools/call - unknown tool', () => {
    it('returns error for unknown tool', () => {
      const res = handleRequest({
        jsonrpc: '2.0', id: 6, method: 'tools/call',
        params: { name: 'nonexistent_tool', arguments: {} },
      });
      expect(res.error).toEqual(
        expect.objectContaining({ code: -32602, message: expect.stringContaining('Unknown tool') })
      );
    });
  });

  describe('soloknuckle_intercept', () => {
    it('reports safe commands as not blocked', () => {
      const res = handleRequest({
        jsonrpc: '2.0', id: 10, method: 'tools/call',
        params: { name: 'soloknuckle_intercept', arguments: { command: 'npm run build' } },
      });
      const content = (res.result as { content: Array<{ text: string }> }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.blocked).toBe(false);
      expect(parsed.reason).toBeNull();
    });

    it('reports destructive commands as blocked', () => {
      const res = handleRequest({
        jsonrpc: '2.0', id: 11, method: 'tools/call',
        params: { name: 'soloknuckle_intercept', arguments: { command: 'rm -rf /' } },
      });
      const content = (res.result as { content: Array<{ text: string }> }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.blocked).toBe(true);
      expect(parsed.reason).toBeTruthy();
    });

    it('reports git push --force as blocked', () => {
      const res = handleRequest({
        jsonrpc: '2.0', id: 12, method: 'tools/call',
        params: { name: 'soloknuckle_intercept', arguments: { command: 'git push --force origin main' } },
      });
      const content = (res.result as { content: Array<{ text: string }> }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.blocked).toBe(true);
    });
  });

  describe('soloknuckle_secrets', () => {
    it('reports clean diff as clean', () => {
      const res = handleRequest({
        jsonrpc: '2.0', id: 20, method: 'tools/call',
        params: { name: 'soloknuckle_secrets', arguments: { diff: '+ const x = 1;' } },
      });
      const content = (res.result as { content: Array<{ text: string }> }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.clean).toBe(true);
      expect(parsed.violations).toEqual([]);
    });

    it('detects API keys in diff', () => {
      const res = handleRequest({
        jsonrpc: '2.0', id: 21, method: 'tools/call',
        params: { name: 'soloknuckle_secrets', arguments: { diff: '+ const key = "api_key = "abcdef1234567890"' } },
      });
      const content = (res.result as { content: Array<{ text: string }> }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.clean).toBe(false);
      expect(parsed.violations.length).toBeGreaterThan(0);
    });
  });

  describe('soloknuckle_flags', () => {
    it('reads flags from flags.json', () => {
      const flagsPath = path.join(process.cwd(), 'flags.json');
      const existed = fs.existsSync(flagsPath);
      const original = existed ? fs.readFileSync(flagsPath, 'utf-8') : null;

      fs.writeFileSync(flagsPath, JSON.stringify({ 'test-flag': true, 'other-flag': false }, null, 2));

      const res = handleRequest({
        jsonrpc: '2.0', id: 30, method: 'tools/call',
        params: { name: 'soloknuckle_flags', arguments: {} },
      });
      const content = (res.result as { content: Array<{ text: string }> }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed['test-flag']).toBe(true);
      expect(parsed['other-flag']).toBe(false);

      if (original !== null) fs.writeFileSync(flagsPath, original);
      else if (!existed) fs.unlinkSync(flagsPath);
    });
  });

  describe('soloknuckle_flag_set', () => {
    it('creates and sets a flag', () => {
      const flagsPath = path.join(process.cwd(), 'flags.json');
      const existed = fs.existsSync(flagsPath);
      const original = existed ? fs.readFileSync(flagsPath, 'utf-8') : null;

      fs.writeFileSync(flagsPath, JSON.stringify({}, null, 2));

      const res = handleRequest({
        jsonrpc: '2.0', id: 31, method: 'tools/call',
        params: { name: 'soloknuckle_flag_set', arguments: { name: 'new-feature', enabled: true } },
      });
      const content = (res.result as { content: Array<{ text: string }> }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.flag).toBe('new-feature');
      expect(parsed.enabled).toBe(true);

      const flags = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
      expect(flags['new-feature']).toBe(true);

      if (original !== null) fs.writeFileSync(flagsPath, original);
      else if (!existed) fs.unlinkSync(flagsPath);
    });

    it('returns error when name is missing', () => {
      const res = handleRequest({
        jsonrpc: '2.0', id: 32, method: 'tools/call',
        params: { name: 'soloknuckle_flag_set', arguments: { enabled: true } },
      });
      expect(res.error).toEqual(
        expect.objectContaining({ code: -32602, message: expect.stringContaining('Missing flag name') })
      );
    });
  });

  describe('soloknuckle_telemetry', () => {
    it('returns telemetry data', () => {
      const res = handleRequest({
        jsonrpc: '2.0', id: 40, method: 'tools/call',
        params: { name: 'soloknuckle_telemetry', arguments: {} },
      });
      const content = (res.result as { content: Array<{ text: string }> }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed).toHaveProperty('humanCommits');
      expect(parsed).toHaveProperty('aiCommits');
      expect(parsed).toHaveProperty('linesByHuman');
      expect(parsed).toHaveProperty('linesByAi');
    });
  });

  describe('soloknuckle_score', () => {
    it('returns score with all categories', () => {
      const res = handleRequest({
        jsonrpc: '2.0', id: 50, method: 'tools/call',
        params: { name: 'soloknuckle_score', arguments: {} },
      });
      const content = (res.result as { content: Array<{ text: string }> }).content;
      const parsed = JSON.parse(content[0].text);
      expect(parsed).toHaveProperty('overall');
      expect(parsed).toHaveProperty('quality');
      expect(parsed).toHaveProperty('testing');
      expect(parsed).toHaveProperty('security');
      expect(parsed).toHaveProperty('efficiency');
      expect(parsed).toHaveProperty('accessibility');
      expect(parsed).toHaveProperty('details');
      expect(typeof parsed.overall).toBe('number');
    });
  });

  describe('notifications/initialized', () => {
    it('returns empty result for initialized notification', () => {
      const res = handleRequest({ jsonrpc: '2.0', id: 99, method: 'notifications/initialized' });
      expect(res.result).toEqual({});
    });
  });
});
