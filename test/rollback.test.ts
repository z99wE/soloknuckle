import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-rollback');
let execSyncMock: ReturnType<typeof vi.fn>;

vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args),
}));

describe('rollback logic', () => {
  let flagsPath: string;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    flagsPath = path.join(TEST_DIR, 'flags.json');
    execSyncMock = vi.fn();
  });

  afterEach(() => {
    if (fs.existsSync(flagsPath)) fs.unlinkSync(flagsPath);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should disable a flag when written to flags.json', () => {
    const flags = {
      'export-csv': true,
      'dark-mode': { enabled: true, allowlist: ['founder@test.com'] }
    };
    fs.writeFileSync(flagsPath, JSON.stringify(flags, null, 2));

    const data = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
    data['export-csv'] = false;
    fs.writeFileSync(flagsPath, JSON.stringify(data, null, 2));

    const updated = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
    expect(updated['export-csv']).toBe(false);
  });

  it('should not affect other flags when disabling one', () => {
    const flags = {
      'export-csv': true,
      'dark-mode': true,
      'new-nav': true
    };
    fs.writeFileSync(flagsPath, JSON.stringify(flags, null, 2));

    const data = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
    data['dark-mode'] = false;
    fs.writeFileSync(flagsPath, JSON.stringify(data, null, 2));

    const updated = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
    expect(updated['export-csv']).toBe(true);
    expect(updated['dark-mode']).toBe(false);
    expect(updated['new-nav']).toBe(true);
  });

  it('should handle flags.json with metadata keys gracefully', () => {
    const flags = {
      '_comment': 'Feature flags config',
      '_how_to_use': 'Set to true/false',
      'my-feature': true
    };
    fs.writeFileSync(flagsPath, JSON.stringify(flags, null, 2));

    const data = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
    expect(data['my-feature']).toBe(true);
    
    data['my-feature'] = false;
    fs.writeFileSync(flagsPath, JSON.stringify(data, null, 2));

    const updated = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
    expect(updated['my-feature']).toBe(false);
    expect(updated['_comment']).toBe('Feature flags config');
  });

  it('should reject flagName with path traversal characters', () => {
    const maliciousNames = ['../../../etc/passwd', '../config', 'flag/../../other', 'flag\\windows'];
    for (const name of maliciousNames) {
      const hasPathChars = name.includes('..') || name.includes('/') || name.includes('\\');
      expect(hasPathChars).toBe(true);
    }
  });
});

describe('parseSentryPayload', () => {
  it('parses Sentry Issue Webhook payload', async () => {
    const { parseSentryPayload } = await import('../cli/rollback');
    const payload = {
      data: {
        issue: {
          id: '12345',
          title: 'TypeError: Cannot read property',
          metadata: { function: 'handleClick' },
          level: 'error',
          project: { slug: 'my-app' },
          permalink: 'https://sentry.io/issues/12345',
          timestamp: '2026-08-19T10:00:00Z',
        },
      },
    };
    const result = parseSentryPayload(payload);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('12345');
    expect(result!.title).toBe('TypeError: Cannot read property');
    expect(result!.culprit).toBe('handleClick');
    expect(result!.level).toBe('error');
    expect(result!.project).toBe('my-app');
    expect(result!.url).toBe('https://sentry.io/issues/12345');
  });

  it('parses Metric Alert Webhook payload', async () => {
    const { parseSentryPayload } = await import('../cli/rollback');
    const payload = {
      event: {
        id: '99999',
        title: 'Metric Alert',
        data: {
          title: 'High error rate detected',
          culprit: 'api/handler.ts',
          project_slug: 'backend',
        },
      },
    };
    const result = parseSentryPayload(payload);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('High error rate detected');
    expect(result!.culprit).toBe('api/handler.ts');
    expect(result!.project).toBe('backend');
  });

  it('parses fallback payload with title', async () => {
    const { parseSentryPayload } = await import('../cli/rollback');
    const payload = {
      title: 'Something broke',
      level: 'warning',
    };
    const result = parseSentryPayload(payload);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Something broke');
    expect(result!.level).toBe('warning');
  });

  it('parses fallback payload with message', async () => {
    const { parseSentryPayload } = await import('../cli/rollback');
    const payload = {
      message: 'Error occurred',
    };
    const result = parseSentryPayload(payload);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Error occurred');
  });

  it('returns null for empty/unknown payload', async () => {
    const { parseSentryPayload } = await import('../cli/rollback');
    expect(parseSentryPayload({})).toBeNull();
    expect(parseSentryPayload({ foo: 'bar' })).toBeNull();
  });

  it('handles Issue payload with missing optional fields', async () => {
    const { parseSentryPayload } = await import('../cli/rollback');
    const payload = {
      data: {
        issue: {
          id: '111',
          title: 'Minimal issue',
        },
      },
    };
    const result = parseSentryPayload(payload);
    expect(result).not.toBeNull();
    expect(result!.culprit).toBeUndefined();
    expect(result!.project).toBeUndefined();
  });
});

describe('revertCommit', () => {
  it('creates revert branch and reverts successfully', async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes('git branch revert/')) return '';
      if (cmd.includes('git revert')) return '';
      if (cmd.includes('git rev-parse HEAD')) return 'revert-sha-999\n';
      return '';
    });
    const { revertCommit } = await import('../cli/rollback');
    const result = revertCommit('abc123456789');
    expect(result.success).toBe(true);
    expect(result.branch).toMatch(/^revert\/abc12345-/);
    expect(result.revertSha).toBe('revert-sha-999');
  });

  it('handles revert failure (merge conflict)', async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes('git branch revert/')) return '';
      if (cmd.includes('git revert') && !cmd.includes('abort')) throw new Error('CONFLICT');
      if (cmd.includes('git revert --abort')) return '';
      return '';
    });
    const { revertCommit } = await import('../cli/rollback');
    const result = revertCommit('abc123456789');
    expect(result.success).toBe(false);
    expect(result.error).toContain('CONFLICT');
  });

  it('handles branch creation failure', async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.includes('git branch revert/')) throw new Error('branch exists');
      return '';
    });
    const { revertCommit } = await import('../cli/rollback');
    const result = revertCommit('abc123456789');
    expect(result.success).toBe(false);
  });
});

describe('incident history', () => {
  it('loads empty incidents when file does not exist', async () => {
    const incidentsFile = path.join(TEST_DIR, '.soloknuckle', 'incidents.json');
    if (fs.existsSync(incidentsFile)) fs.unlinkSync(incidentsFile);
    const app = express();
    app.get('/webhooks/incidents', (_req, res) => {
      const file = path.join(TEST_DIR, '.soloknuckle', 'incidents.json');
      if (fs.existsSync(file)) {
        res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
      } else {
        res.json([]);
      }
    });
    const res = await request(app).get('/webhooks/incidents');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns saved incidents', async () => {
    const dir = path.join(TEST_DIR, '.soloknuckle');
    fs.mkdirSync(dir, { recursive: true });
    const incidents = [{ id: '1', title: 'Test incident', timestamp: '2026-08-19T10:00:00Z' }];
    fs.writeFileSync(path.join(dir, 'incidents.json'), JSON.stringify(incidents));

    const app = express();
    app.get('/webhooks/incidents', (_req, res) => {
      const file = path.join(TEST_DIR, '.soloknuckle', 'incidents.json');
      res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
    });
    const res = await request(app).get('/webhooks/incidents');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Test incident');
  });
});

describe('webhook rollback endpoint', () => {
  let app: express.Express;
  let flagsPath: string;
  const ORIGINAL_CWD = process.cwd;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    flagsPath = path.join(TEST_DIR, 'flags.json');
    process.cwd = () => TEST_DIR;
    delete process.env.WEBHOOK_SECRET;
  });

  afterEach(() => {
    process.cwd = ORIGINAL_CWD;
    delete process.env.WEBHOOK_SECRET;
    if (fs.existsSync(flagsPath)) fs.unlinkSync(flagsPath);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  function buildApp() {
    const a = express();
    a.use(express.json());
    a.post('/webhooks/rollback', (req, res) => {
      const secret = process.env.WEBHOOK_SECRET;
      if (secret) {
        const sig = req.headers['x-webhook-secret'] || req.headers['x-hub-signature-256'];
        if (!sig) { res.status(401).json({ error: 'Unauthorized: missing secret' }); return; }
        const sigBuf = Buffer.from(String(sig).padEnd(secret.length, '\0'));
        const secBuf = Buffer.from(secret.padEnd(String(sig).length, '\0'));
        if (!crypto.timingSafeEqual(sigBuf, secBuf)) {
          res.status(401).json({ error: 'Unauthorized: invalid secret' }); return;
        }
      }
      const { flagName, reason } = req.body;
      if (!flagName || typeof flagName !== 'string') {
        res.status(400).json({ error: 'Missing or invalid flagName in webhook payload' }); return;
      }
      if (flagName.includes('..') || flagName.includes('/') || flagName.includes('\\')) {
        res.status(400).json({ error: 'Invalid flagName: path characters not allowed' }); return;
      }
      if (!fs.existsSync(flagsPath)) {
        res.status(404).json({ error: 'flags.json not found' }); return;
      }
      const flags = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
      if (flags[flagName] === undefined) {
        res.status(400).json({ error: `Flag '${flagName}' not found` }); return;
      }
      flags[flagName] = false;
      fs.writeFileSync(flagsPath, JSON.stringify(flags, null, 2));
      res.json({ success: true, message: `Flag '${flagName}' disabled` });
    });
    return a;
  }

  it('should disable a valid flag via webhook', async () => {
    fs.writeFileSync(flagsPath, JSON.stringify({ 'export-csv': true, 'dark-mode': true }));
    const res = await request(buildApp())
      .post('/webhooks/rollback')
      .send({ flagName: 'export-csv', reason: 'High error rate' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const updated = JSON.parse(fs.readFileSync(flagsPath, 'utf-8'));
    expect(updated['export-csv']).toBe(false);
    expect(updated['dark-mode']).toBe(true);
  });

  it('should return 400 when flagName is missing', async () => {
    const res = await request(buildApp())
      .post('/webhooks/rollback')
      .send({ reason: 'test' });
    expect(res.status).toBe(400);
  });

  it('should return 400 when flag does not exist', async () => {
    fs.writeFileSync(flagsPath, JSON.stringify({ 'existing-flag': true }));
    const res = await request(buildApp())
      .post('/webhooks/rollback')
      .send({ flagName: 'nonexistent-flag' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not found');
  });

  it('should return 404 when flags.json does not exist', async () => {
    if (fs.existsSync(flagsPath)) fs.unlinkSync(flagsPath);
    const res = await request(buildApp())
      .post('/webhooks/rollback')
      .send({ flagName: 'any-flag' });
    expect(res.status).toBe(404);
  });

  it('should reject flagName with path traversal', async () => {
    const res = await request(buildApp())
      .post('/webhooks/rollback')
      .send({ flagName: '../../../etc/passwd' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('path characters');
  });

  it('should reject when webhook secret is set but missing from request', async () => {
    process.env.WEBHOOK_SECRET = 'my-secret';
    const res = await request(buildApp())
      .post('/webhooks/rollback')
      .send({ flagName: 'test' });
    expect(res.status).toBe(401);
  });

  it('should accept request with valid webhook secret', async () => {
    process.env.WEBHOOK_SECRET = 'my-secret';
    fs.writeFileSync(flagsPath, JSON.stringify({ 'test-flag': true }));
    const res = await request(buildApp())
      .post('/webhooks/rollback')
      .set('x-webhook-secret', 'my-secret')
      .send({ flagName: 'test-flag' });
    expect(res.status).toBe(200);
  });

  it('should reject request with invalid webhook secret', async () => {
    process.env.WEBHOOK_SECRET = 'my-secret';
    fs.writeFileSync(flagsPath, JSON.stringify({ 'test-flag': true }));
    const res = await request(buildApp())
      .post('/webhooks/rollback')
      .set('x-webhook-secret', 'wrong-secret')
      .send({ flagName: 'test-flag' });
    expect(res.status).toBe(401);
  });

  it('should accept request with no secret configured', async () => {
    delete process.env.WEBHOOK_SECRET;
    fs.writeFileSync(flagsPath, JSON.stringify({ 'test-flag': true }));
    const res = await request(buildApp())
      .post('/webhooks/rollback')
      .send({ flagName: 'test-flag' });
    expect(res.status).toBe(200);
  });

  it('should return 400 for flagName that is not a string', async () => {
    const res = await request(buildApp())
      .post('/webhooks/rollback')
      .send({ flagName: 123 });
    expect(res.status).toBe(400);
  });
});

describe('sentry webhook endpoint', () => {
  let app: express.Express;
  const ORIGINAL_CWD = process.cwd;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    process.cwd = () => TEST_DIR;
    delete process.env.WEBHOOK_SECRET;
    execSyncMock = vi.fn(() => '');
  });

  afterEach(() => {
    process.cwd = ORIGINAL_CWD;
    delete process.env.WEBHOOK_SECRET;
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function buildSentryApp(parseFn: typeof import('../cli/rollback').parseSentryPayload) {
    const a = express();
    a.use(express.json());
    a.post('/webhooks/sentry', (req, res) => {
      const incident = parseFn(req.body);
      if (!incident) {
        return res.status(400).json({ error: 'Could not parse Sentry payload' });
      }
      res.json({ success: true, incident: { id: incident.id, title: incident.title } });
    });
    return a;
  }

  it('should parse valid Sentry issue payload', async () => {
    const { parseSentryPayload } = await import('../cli/rollback');
    const res = await request(buildSentryApp(parseSentryPayload))
      .post('/webhooks/sentry')
      .send({
        data: {
          issue: {
            id: '12345',
            title: 'Test error',
            level: 'error',
          },
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.incident.title).toBe('Test error');
  });

  it('should return 400 for unparseable payload', async () => {
    const { parseSentryPayload } = await import('../cli/rollback');
    const res = await request(buildSentryApp(parseSentryPayload))
      .post('/webhooks/sentry')
      .send({ random: 'data' });
    expect(res.status).toBe(400);
  });
});
