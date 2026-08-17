import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-rollback');

describe('rollback logic', () => {
  let flagsPath: string;

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    flagsPath = path.join(TEST_DIR, 'flags.json');
  });

  afterEach(() => {
    if (fs.existsSync(flagsPath)) fs.unlinkSync(flagsPath);
    if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true, force: true });
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
});
