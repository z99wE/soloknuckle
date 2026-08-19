import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-ai-watcher');

describe('AI Commit Watcher', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
    // Clean up watcher file
    const watcherFile = path.join(TEST_DIR, '.soloknuckle', 'ai-watcher.json');
    if (fs.existsSync(watcherFile)) fs.unlinkSync(watcherFile);
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('isAICommit', () => {
    it('detects Copilot commits', async () => {
      const { isAICommit } = await import('../cli/ai-watcher');
      expect(isAICommit('Co-authored-by: Copilot <copilot@github.com>')).toBe(true);
    });

    it('detects Claude commits', async () => {
      const { isAICommit } = await import('../cli/ai-watcher');
      expect(isAICommit('Co-authored-by: Claude <claude@anthropic.com>')).toBe(true);
    });

    it('detects GPT commits', async () => {
      const { isAICommit } = await import('../cli/ai-watcher');
      expect(isAICommit('Co-authored-by: GPT <gpt@openai.com>')).toBe(true);
    });

    it('detects Cursor commits', async () => {
      const { isAICommit } = await import('../cli/ai-watcher');
      expect(isAICommit('fix: cursor generated code')).toBe(true);
    });

    it('detects Windsurf commits', async () => {
      const { isAICommit } = await import('../cli/ai-watcher');
      expect(isAICommit('refactor: windsurf optimization')).toBe(true);
    });

    it('detects Anthropic commits', async () => {
      const { isAICommit } = await import('../cli/ai-watcher');
      expect(isAICommit('feat: anthropic model integration')).toBe(true);
    });

    it('detects OpenAI commits', async () => {
      const { isAICommit } = await import('../cli/ai-watcher');
      expect(isAICommit('chore: openai api update')).toBe(true);
    });

    it('returns false for human commits', async () => {
      const { isAICommit } = await import('../cli/ai-watcher');
      expect(isAICommit('fix: resolve null pointer in handler')).toBe(false);
      expect(isAICommit('feat: add user authentication')).toBe(false);
      expect(isAICommit('chore: update dependencies')).toBe(false);
    });

    it('is case-insensitive', async () => {
      const { isAICommit } = await import('../cli/ai-watcher');
      expect(isAICommit('co-authored-by: copilot <copilot@github.com>')).toBe(true);
      expect(isAICommit('Co-Authored-By: Claude <claude@anthropic.com>')).toBe(true);
    });
  });

  describe('loadWatcherData', () => {
    it('creates fresh data when no file exists', async () => {
      const { loadWatcherData } = await import('../cli/ai-watcher');
      const data = loadWatcherData();
      expect(data.totalCommits).toBe(0);
      expect(data.aiCommits).toBe(0);
      expect(data.humanCommits).toBe(0);
      expect(data.records).toHaveLength(0);
    });

    it('loads existing watcher data', async () => {
      const { loadWatcherData, saveWatcherData } = await import('../cli/ai-watcher');
      const data = loadWatcherData();
      data.totalCommits = 10;
      data.aiCommits = 3;
      data.humanCommits = 7;
      data.acceptanceRate = 100;
      data.quarantineRate = 0;
      saveWatcherData(data);

      const loaded = loadWatcherData();
      expect(loaded.totalCommits).toBe(10);
      expect(loaded.aiCommits).toBe(3);
      expect(loaded.humanCommits).toBe(7);
    });

    it('returns fresh data on corrupted file', async () => {
      const watcherFile = path.join(TEST_DIR, '.soloknuckle', 'ai-watcher.json');
      fs.mkdirSync(path.join(TEST_DIR, '.soloknuckle'), { recursive: true });
      fs.writeFileSync(watcherFile, 'not valid json');

      const { loadWatcherData } = await import('../cli/ai-watcher');
      const data = loadWatcherData();
      expect(data.totalCommits).toBe(0);
    });
  });

  describe('saveWatcherData', () => {
    it('creates .soloknuckle directory if it does not exist', async () => {
      const { saveWatcherData, loadWatcherData } = await import('../cli/ai-watcher');
      const data = loadWatcherData();
      data.totalCommits = 5;
      saveWatcherData(data);

      const watcherFile = path.join(TEST_DIR, '.soloknuckle', 'ai-watcher.json');
      expect(fs.existsSync(watcherFile)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(watcherFile, 'utf-8'));
      expect(saved.totalCommits).toBe(5);
    });
  });

  describe('getWatcherSummary', () => {
    it('returns summary string', async () => {
      const { getWatcherSummary, saveWatcherData, loadWatcherData } = await import('../cli/ai-watcher');
      const data = loadWatcherData();
      data.totalCommits = 10;
      data.aiCommits = 3;
      data.humanCommits = 7;
      data.acceptanceRate = 80;
      data.quarantineRate = 20;
      saveWatcherData(data);

      const summary = getWatcherSummary();
      expect(summary).toContain('Total commits tracked: 10');
      expect(summary).toContain('AI commits: 3');
      expect(summary).toContain('Human commits: 7');
      expect(summary).toContain('AI acceptance rate: 80%');
      expect(summary).toContain('AI quarantine rate: 20%');
    });
  });
});
