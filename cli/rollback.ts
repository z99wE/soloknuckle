import chalk from 'chalk';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';

function verifyWebhookSecret(req: express.Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    // Log warning once when server starts
    if (!(global as Record<string, unknown>).__webhookSecretWarned) {
      console.log(chalk.yellow('⚠️  WARNING: No WEBHOOK_SECRET configured. Webhook requests will be accepted without verification.'));
      console.log(chalk.dim('   Set WEBHOOK_SECRET environment variable for production use.'));
      (global as Record<string, unknown>).__webhookSecretWarned = true;
    }
    return true;
  }
  const signature = req.headers['x-webhook-secret'] || req.headers['x-hub-signature-256'];
  if (!signature) return false;
  const sigBuf = Buffer.from(String(signature));
  const secretBuf = Buffer.from(secret);
  if (sigBuf.length !== secretBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, secretBuf);
}

export function initWebhookListener() {
  const PORT = process.env.WEBHOOK_PORT || 3002;
  const app = express();

  app.use(cors());
  app.use(express.json());

  console.log(chalk.yellow(`Starting Rollback Daemon on port ${PORT}...`));

  app.post('/webhooks/rollback', (req, res) => {
    if (!verifyWebhookSecret(req)) {
      console.log(chalk.red('[SECURITY] Webhook rejected: invalid or missing secret'));
      return res.status(401).json({ error: 'Unauthorized: missing or invalid webhook secret' });
    }

    const { flagName, reason } = req.body;

    if (!flagName || typeof flagName !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid flagName in webhook payload' });
    }

    if (flagName.includes('..') || flagName.includes('/') || flagName.includes('\\')) {
      return res.status(400).json({ error: 'Invalid flagName: path characters not allowed' });
    }

    console.log(chalk.red(`\n[CRITICAL ALERT RECEIVED] Reason: ${reason || 'Automated Error Threshold Triggered'}`));
    console.log(chalk.yellow(`Attempting to rollback feature flag: '${flagName}'...`));

    const flagsPath = path.join(process.cwd(), 'flags.json');

    if (!fs.existsSync(flagsPath)) {
      console.log(chalk.red(`Rollback failed: 'flags.json' not found in project root.`));
      return res.status(404).json({ error: 'flags.json not found' });
    }

    try {
      const flagsData = fs.readFileSync(flagsPath, 'utf-8');
      const flags = JSON.parse(flagsData);

      if (flags[flagName] === undefined) {
        console.log(chalk.yellow(`Flag '${flagName}' does not exist in flags.json.`));
        return res.status(400).json({ error: `Flag '${flagName}' not found` });
      }

      flags[flagName] = false;
      fs.writeFileSync(flagsPath, JSON.stringify(flags, null, 2));

      console.log(chalk.green(`Rollback successful. Feature '${flagName}' is now DISABLED.`));
      res.json({ success: true, message: `Flag '${flagName}' disabled` });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(chalk.red(`Error processing rollback: ${message}`));
      res.status(500).json({ error: 'Failed to process flags.json' });
    }
  });

  app.listen(PORT, () => {
    console.log(chalk.green(`Listening for Datadog/Sentry webhooks at http://localhost:${PORT}/webhooks/rollback`));
  });
}
