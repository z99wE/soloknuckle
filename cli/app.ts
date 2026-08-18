import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { applyPersona, PersonaType } from './personas';
import { logTelemetry, getTelemetry } from './telemetry';
import { loadConfig, saveConfig } from './config';
import { calculateMetrics } from './scorer';
import { interceptCommand } from './interceptor';

function createRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();
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
  app.use(cors());
  app.use(express.json());

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

  return app;
}
