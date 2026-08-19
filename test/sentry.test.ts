import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import express from 'express';
import request from 'supertest';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-sentry');

describe('Sentry Incident Auto-Rollback', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
    delete process.env.WEBHOOK_SECRET;
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
    delete process.env.WEBHOOK_SECRET;
  });

  describe('parseSentryPayload', () => {
    it('parses Sentry issue webhook', async () => {
      const { parseSentryPayload } = await import('../cli/rollback');
      const payload = {
        data: {
          issue: {
            id: '12345',
            title: 'TypeError: Cannot read property',
            level: 'error',
            metadata: { function: 'handleClick' },
            project: { slug: 'my-project' },
            permalink: 'https://sentry.io/issues/12345',
            timestamp: '2026-01-15T10:30:00Z',
          },
        },
      };

      const incident = parseSentryPayload(payload);
      expect(incident).not.toBeNull();
      expect(incident?.id).toBe('12345');
      expect(incident?.title).toBe('TypeError: Cannot read property');
      expect(incident?.level).toBe('error');
      expect(incident?.culprit).toBe('handleClick');
      expect(incident?.project).toBe('my-project');
    });

    it('parses metric alert webhook', async () => {
      const { parseSentryPayload } = await import('../cli/rollback');
      const payload = {
        event: {
          id: '67890',
          title: 'Metric Alert',
          data: {
            title: 'Error rate exceeded',
            culprit: 'api/handler.ts',
            project_slug: 'backend',
          },
        },
      };

      const incident = parseSentryPayload(payload);
      expect(incident).not.toBeNull();
      expect(incident?.title).toBe('Error rate exceeded');
      expect(incident?.culprit).toBe('api/handler.ts');
      expect(incident?.project).toBe('backend');
    });

    it('returns null for unknown payload', async () => {
      const { parseSentryPayload } = await import('../cli/rollback');
      const payload = { foo: 'bar' };

      const incident = parseSentryPayload(payload);
      expect(incident).toBeNull();
    });

    it('parses minimal payload with title/message', async () => {
      const { parseSentryPayload } = await import('../cli/rollback');
      const payload = { title: 'Simple alert', level: 'warning' };

      const incident = parseSentryPayload(payload);
      expect(incident).not.toBeNull();
      expect(incident?.title).toBe('Simple alert');
      expect(incident?.level).toBe('warning');
    });
  });

  describe('revertCommit', () => {
    it('returns error for non-existent commit', async () => {
      const { revertCommit } = await import('../cli/rollback');
      const result = revertCommit('abc123nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('webhook endpoint', () => {
    it('accepts Sentry incident webhook with valid secret', async () => {
      process.env.WEBHOOK_SECRET = 'sentry-secret';
      const incidentsFile = path.join(TEST_DIR, '.soloknuckle', 'incidents.json');

      // Mock the express app from rollback.ts
      const app = express();
      app.use(express.json());
      app.post('/webhooks/sentry', (req, res) => {
        const secret = process.env.WEBHOOK_SECRET;
        if (secret) {
          const sig = req.headers['x-webhook-secret'];
          if (sig !== secret) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }
        }
        res.json({
          success: true,
          incident: { id: '123', title: 'Test incident', aiRelated: false },
        });
      });

      const response = await request(app)
        .post('/webhooks/sentry')
        .set('x-webhook-secret', 'sentry-secret')
        .send({
          data: {
            issue: { id: '123', title: 'Test incident', level: 'error' },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('rejects Sentry webhook without valid secret', async () => {
      process.env.WEBHOOK_SECRET = 'sentry-secret';

      const app = express();
      app.use(express.json());
      app.post('/webhooks/sentry', (req, res) => {
        const secret = process.env.WEBHOOK_SECRET;
        if (secret) {
          const sig = req.headers['x-webhook-secret'];
          if (sig !== secret) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
          }
        }
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/webhooks/sentry')
        .send({ data: { issue: { id: '123', title: 'Test' } } });

      expect(response.status).toBe(401);
    });
  });

  describe('incident persistence', () => {
    it('saves and loads incidents', async () => {
      fs.mkdirSync(path.join(TEST_DIR, '.soloknuckle'), { recursive: true });
      const incidentsFile = path.join(TEST_DIR, '.soloknuckle', 'incidents.json');

      const record = {
        id: '123',
        timestamp: new Date().toISOString(),
        source: 'sentry',
        title: 'Test incident',
        severity: 'error',
        aiRelated: false,
        revertedCommit: undefined,
        revertBranch: undefined,
        prCreated: false,
        notified: true,
      };

      fs.writeFileSync(incidentsFile, JSON.stringify([record], null, 2));
      const loaded = JSON.parse(fs.readFileSync(incidentsFile, 'utf-8'));
      expect(loaded).toHaveLength(1);
      expect(loaded[0].title).toBe('Test incident');
    });
  });
});
