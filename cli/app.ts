import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { applyPersona, PersonaType } from './personas';
import { logTelemetry, getTelemetry } from './telemetry';
import { loadConfig, saveConfig, generateProviderId, PROVIDER_REGISTRY, type LLMProviderType } from './config';
import { calculateMetrics, generateSuggestions } from './scorer';
import { callLLM } from './llm-client';
import { interceptCommand } from './interceptor';

function createRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  // Evict stale entries every minute to prevent unbounded growth
  const evictInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, timestamps] of hits) {
      const valid = timestamps.filter(t => t > cutoff);
      if (valid.length === 0) hits.delete(ip);
      else hits.set(ip, valid);
    }
  }, 60_000);
  // Allow the process to exit even if the interval is still running
  if (evictInterval.unref) evictInterval.unref();

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const timestamps = (hits.get(ip) || []).filter(t => t > now - windowMs);
    if (timestamps.length >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
      return;
    }
    timestamps.push(now);
    hits.set(ip, timestamps);
    next();
  };
}

export function createApp() {
  const app = express();
  app.use(cors({ origin: /^https?:\/\/localhost(:\d+)?$/ }));
  app.use(express.json({ limit: '1mb' }));

  const apiLimiter = createRateLimiter(30, 60_000);
  app.use('/api/', apiLimiter);

  const ALLOWED_COMMANDS = ['npm test', 'npm run lint', 'git status', 'git diff', 'npx soloknuckle check'];
  const interceptions: Array<{ time: string; command: string; reason?: string }> = [];

  app.get('/api/sandbox/interceptions', (_req, res) => {
    res.json(interceptions);
  });

  app.post('/api/sandbox', (req, res) => {
    const command = req.body.command;
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'No command provided' });
    }

    const interception = interceptCommand(command);
    if (interception.blocked) {
      interceptions.unshift({ time: new Date().toISOString(), command, reason: interception.reason });
      if (interceptions.length > 50) interceptions.pop();
      return res.status(403).json(JSON.parse(interception.jsonResponse!));
    }

    if (!ALLOWED_COMMANDS.includes(command)) {
      console.log(chalk.red(`[Sandbox Blocked] Unauthorized command attempted: ${command}`));
      const reason = `Unauthorized command. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`;
      interceptions.unshift({ time: new Date().toISOString(), command, reason });
      if (interceptions.length > 50) interceptions.pop();
      return res.status(403).json({ success: false, output: `Error: ${reason}` });
    }

    console.log(chalk.cyan(`[Sandbox] Executing: ${command}`));
    try {
      const output = execSync(command, { encoding: 'utf-8', cwd: process.cwd(), timeout: 10000 });
      res.json({ success: true, output });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? ('stderr' in err ? (err as { stderr?: string }).stderr || err.message : err.message) : 'Execution failed';
      res.json({ success: false, output: errorMsg });
    }
  });

  app.get('/api/config/llm', (_req, res) => {
    const config = loadConfig();
    const maskedKey = config.LLM_API_KEY ? `${config.LLM_API_KEY.slice(0, 4)}...${config.LLM_API_KEY.slice(-4)}` : '';
    res.json({
      provider: config.LLM_PROVIDER || 'OpenAI',
      apiKey: maskedKey,
      baseUrl: config.LLM_BASE_URL || 'http://localhost:11434/api/chat',
      model: config.LLM_MODEL || ''
    });
  });

  app.post('/api/config/llm', (req, res) => {
    const { provider, apiKey, baseUrl, model } = req.body || {};
    if (typeof provider !== 'string' || !provider.trim()) {
      return res.status(400).json({ error: 'provider is required and must be a non-empty string' });
    }
    const config = loadConfig();
    config.LLM_PROVIDER = provider.trim();
    if (apiKey && typeof apiKey === 'string' && !apiKey.includes('...')) {
      config.LLM_API_KEY = apiKey;
    }
    if (baseUrl !== undefined) config.LLM_BASE_URL = String(baseUrl);
    if (model !== undefined) config.LLM_MODEL = String(model);

    saveConfig(config);
    res.json({ success: true });
  });

  // ── Multi-Provider CRUD ────────────────────────────────────────────────────

  app.get('/api/config/providers', (_req, res) => {
    const config = loadConfig();
    const providers = (config.providers || []).map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      apiKey: p.apiKey ? `${p.apiKey.slice(0, 4)}...${p.apiKey.slice(-4)}` : '',
      baseUrl: p.baseUrl || PROVIDER_REGISTRY[p.type]?.defaultBaseUrl || '',
      model: p.model || PROVIDER_REGISTRY[p.type]?.defaultModel || '',
    }));
    res.json({ providers, activeId: config.activeProviderId || null });
  });

  app.post('/api/config/providers', (req, res) => {
    const { name, type, apiKey, baseUrl, model } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required and must be a non-empty string' });
    }
    if (typeof type !== 'string' || !PROVIDER_REGISTRY[type as LLMProviderType]) {
      return res.status(400).json({ error: `type must be one of: ${Object.keys(PROVIDER_REGISTRY).join(', ')}` });
    }
    const config = loadConfig();
    if (!config.providers) config.providers = [];

    const newProvider = {
      id: generateProviderId(),
      name: name.trim(),
      type: type as LLMProviderType,
      apiKey: (typeof apiKey === 'string' && apiKey && !apiKey.includes('...')) ? apiKey : undefined,
      baseUrl: (typeof baseUrl === 'string' && baseUrl) ? baseUrl : undefined,
      model: (typeof model === 'string' && model) ? model : undefined,
    };

    config.providers.push(newProvider);

    // Auto-activate if this is the first provider
    if (!config.activeProviderId || config.providers.length === 1) {
      config.activeProviderId = newProvider.id;
    }

    saveConfig(config);
    res.json({ success: true, provider: { id: newProvider.id, name: newProvider.name, type: newProvider.type } });
  });

  app.delete('/api/config/providers/:id', (req, res) => {
    const config = loadConfig();
    if (!config.providers) config.providers = [];

    const idx = config.providers.findIndex(p => p.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    config.providers.splice(idx, 1);

    // If we deleted the active provider, fall back to the first remaining one
    if (config.activeProviderId === req.params.id) {
      config.activeProviderId = config.providers[0]?.id || null;
      // Sync legacy fields if a provider is still active
      if (config.activeProviderId) {
        const fallback = config.providers.find(p => p.id === config.activeProviderId);
        if (fallback) {
          config.LLM_PROVIDER = fallback.type;
          config.LLM_API_KEY = fallback.apiKey;
          config.LLM_BASE_URL = fallback.baseUrl;
          config.LLM_MODEL = fallback.model;
        }
      }
    }

    saveConfig(config);
    res.json({ success: true });
  });

  app.post('/api/config/providers/activate', (req, res) => {
    const { providerId } = req.body || {};
    if (typeof providerId !== 'string') {
      return res.status(400).json({ error: 'providerId is required' });
    }
    const config = loadConfig();
    if (!config.providers) config.providers = [];

    const provider = config.providers.find(p => p.id === providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    config.activeProviderId = providerId;
    // Sync legacy fields
    config.LLM_PROVIDER = provider.type;
    config.LLM_API_KEY = provider.apiKey;
    config.LLM_BASE_URL = provider.baseUrl;
    config.LLM_MODEL = provider.model;

    saveConfig(config);
    res.json({ success: true });
  });

  app.post('/api/config/providers/test', async (req, res) => {
    const { providerId } = req.body || {};
    if (typeof providerId !== 'string') {
      return res.status(400).json({ error: 'providerId is required' });
    }
    const config = loadConfig();
    if (!config.providers) config.providers = [];

    const provider = config.providers.find(p => p.id === providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    try {
      // Temporarily set active to test this provider
      const prevActive = config.activeProviderId;
      config.activeProviderId = providerId;
      config.LLM_PROVIDER = provider.type;
      config.LLM_API_KEY = provider.apiKey;
      config.LLM_BASE_URL = provider.baseUrl;
      config.LLM_MODEL = provider.model;
      saveConfig(config);

      const reply = await callLLM('You are a helpful assistant.', 'Reply with exactly one word: OK');

      // Restore previous active provider
      config.activeProviderId = prevActive;
      if (prevActive) {
        const prev = config.providers.find(p => p.id === prevActive);
        if (prev) {
          config.LLM_PROVIDER = prev.type;
          config.LLM_API_KEY = prev.apiKey;
          config.LLM_BASE_URL = prev.baseUrl;
          config.LLM_MODEL = prev.model;
        }
      }
      saveConfig(config);

      res.json({ success: true, reply: reply.trim() });
    } catch (err: unknown) {
      // Restore on error too
      const prevActive = config.activeProviderId;
      config.activeProviderId = prevActive;
      if (prevActive) {
        const prev = config.providers.find(p => p.id === prevActive);
        if (prev) {
          config.LLM_PROVIDER = prev.type;
          config.LLM_API_KEY = prev.apiKey;
          config.LLM_BASE_URL = prev.baseUrl;
          config.LLM_MODEL = prev.model;
        }
      }
      saveConfig(config);

      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.json({ success: false, error: msg });
    }
  });

  app.post('/api/llm/suggest', async (req, res) => {
    try {
      const { metrics } = req.body || {};
      if (!metrics) {
        return res.status(400).json({ error: 'metrics object is required' });
      }
      const suggestions = await generateSuggestions(metrics);
      res.json({ suggestions });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/llm/test', async (_req, res) => {
    try {
      const reply = await callLLM(
        'You are a helpful assistant.',
        'Reply with exactly one word: OK'
      );
      res.json({ success: true, reply: reply.trim() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.json({ success: false, error: msg });
    }
  });

  app.get('/api/telemetry', (_req, res) => {
    res.json(getTelemetry());
  });

  app.post('/api/personas', (req, res) => {
    try {
      const { targetDir, personaProfile } = req.body || {};
      if (typeof targetDir !== 'string' || !targetDir.trim()) {
        return res.status(400).json({ error: 'targetDir is required and must be a non-empty string' });
      }
      if (typeof personaProfile !== 'string' || !personaProfile.trim()) {
        return res.status(400).json({ error: 'personaProfile is required and must be a non-empty string' });
      }
      let type: PersonaType = 'frontend-ux';
      if (personaProfile === 'Backend Security Architect') type = 'backend-security';
      else if (personaProfile === 'Data Engineer') type = 'data-engineer';

      applyPersona(targetDir.trim(), type);
      res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/branches', (_req, res) => {
    try {
      const branchList = execSync('git branch', { encoding: 'utf-8', cwd: process.cwd() });
      const branches = branchList.split('\n')
        .map(b => b.trim())
        .filter(b => b)
        .map(b => ({ name: b.replace('* ', ''), active: b.startsWith('*') }));
      res.json(branches);
    } catch (_err: unknown) {
      res.json([]);
    }
  });

  app.get('/api/safe-mode', (_req, res) => {
    const config = loadConfig();
    res.json({
      hooksEnabled: config.hooksEnabled ?? true,
      aiCommitsEnabled: config.aiCommitsEnabled ?? false
    });
  });

  app.post('/api/safe-mode', (req, res) => {
    const { hooksEnabled, aiCommitsEnabled } = req.body || {};
    const config = loadConfig();
    if (hooksEnabled !== undefined && typeof hooksEnabled === 'boolean') config.hooksEnabled = hooksEnabled;
    if (aiCommitsEnabled !== undefined && typeof aiCommitsEnabled === 'boolean') config.aiCommitsEnabled = aiCommitsEnabled;
    saveConfig(config);
    res.json({ success: true });
  });

  app.get('/api/score', async (_req, res) => {
    try {
      const metrics = calculateMetrics();
      res.json(metrics);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: msg });
    }
  });

  // API catch-all: return JSON 404 for unmatched /api/ routes
  app.all('/api/*splat', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Global error handler: always return JSON, never HTML
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
