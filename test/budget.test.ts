import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-budget');

describe('Agent Behavior Budget', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
    // Clean up any existing budget file
    const budgetFile = path.join(TEST_DIR, '.soloknuckle', 'budget.json');
    if (fs.existsSync(budgetFile)) fs.unlinkSync(budgetFile);
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('loadBudget', () => {
    it('creates fresh state when no budget file exists', async () => {
      const { loadBudget } = await import('../cli/budget');
      const state = loadBudget();
      expect(state.paused).toBe(false);
      expect(state.limits).toHaveLength(4);
      expect(state.session.id).toMatch(/^session-/);
    });

    it('loads existing budget from file', async () => {
      const { loadBudget, saveBudget } = await import('../cli/budget');
      const state = loadBudget();
      state.paused = true;
      state.pauseReason = 'test pause';
      saveBudget(state);

      const loaded = loadBudget();
      expect(loaded.paused).toBe(true);
      expect(loaded.pauseReason).toBe('test pause');
    });

    it('resets session on new day', async () => {
      const { loadBudget, saveBudget } = await import('../cli/budget');
      const state = loadBudget();
      state.daily.date = '2000-01-01';
      state.daily.totals.commits = 50;
      saveBudget(state);

      const loaded = loadBudget();
      expect(loaded.daily.totals.commits).toBe(0);
      expect(loaded.daily.date).not.toBe('2000-01-01');
    });
  });

  describe('checkBudget', () => {
    it('allows action within limits', async () => {
      const { loadBudget, checkBudget } = await import('../cli/budget');
      const state = loadBudget();
      const result = checkBudget(state, 'commits', 1);
      expect(result.allowed).toBe(true);
      expect(result.unit).toBe('commits');
    });

    it('blocks action over session limit', async () => {
      const { loadBudget, saveBudget, checkBudget } = await import('../cli/budget');
      const state = loadBudget();
      state.session.totals.commits = 20; // max per session
      saveBudget(state);

      const result = checkBudget(state, 'commits', 1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Session limit exceeded');
    });

    it('blocks action over daily limit', async () => {
      const { loadBudget, saveBudget, checkBudget } = await import('../cli/budget');
      const state = loadBudget();
      state.daily.totals.commits = 50; // max per day
      saveBudget(state);

      const result = checkBudget(state, 'commits', 1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit exceeded');
    });

    it('blocks action when paused', async () => {
      const { loadBudget, saveBudget, checkBudget } = await import('../cli/budget');
      const state = loadBudget();
      state.paused = true;
      state.pauseReason = 'manual pause';
      saveBudget(state);

      const result = checkBudget(state, 'commits', 1);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('manual pause');
    });
  });

  describe('recordAction', () => {
    it('increments session and daily totals', async () => {
      const { recordAction } = await import('../cli/budget');
      const { state } = recordAction('test commit', 'commits', 1);
      expect(state.session.totals.commits).toBe(1);
      expect(state.daily.totals.commits).toBe(1);
      expect(state.session.actions).toHaveLength(1);
    });

    it('auto-pauses when over budget', async () => {
      const { loadBudget, saveBudget, recordAction } = await import('../cli/budget');
      const state = loadBudget();
      state.session.totals.commits = 19;
      saveBudget(state);

      const { state: updated } = recordAction('another commit', 'commits', 2);
      expect(updated.paused).toBe(true);
      expect(updated.pauseReason).toContain('Session limit exceeded');
    });
  });

  describe('pauseBudget', () => {
    it('pauses with a reason', async () => {
      const { pauseBudget } = await import('../cli/budget');
      const state = pauseBudget('manual pause');
      expect(state.paused).toBe(true);
      expect(state.pauseReason).toBe('manual pause');
      expect(state.pausedAt).toBeDefined();
    });
  });

  describe('resumeBudget', () => {
    it('resumes without resetting session', async () => {
      const { pauseBudget, resumeBudget } = await import('../cli/budget');
      pauseBudget('test pause');
      const state = resumeBudget(false);
      expect(state.paused).toBe(false);
      expect(state.session.totals.commits).toBe(0);
    });

    it('resumes with session reset', async () => {
      const { recordAction, pauseBudget, resumeBudget } = await import('../cli/budget');
      recordAction('test', 'commits', 5);
      pauseBudget('test pause');
      const state = resumeBudget(true);
      expect(state.paused).toBe(false);
      expect(state.session.totals.commits).toBe(0);
      expect(state.session.id).toMatch(/^session-/);
    });
  });

  describe('setLimit', () => {
    it('updates existing limit', async () => {
      const { setLimit } = await import('../cli/budget');
      const state = setLimit('commits', 10, 30);
      const limit = state.limits.find(l => l.unit === 'commits');
      expect(limit?.maxPerSession).toBe(10);
      expect(limit?.maxPerDay).toBe(30);
    });

    it('adds new limit for unknown unit', async () => {
      const { setLimit } = await import('../cli/budget');
      const state = setLimit('deployments', 5, 10);
      const limit = state.limits.find(l => l.unit === 'deployments');
      expect(limit).toBeDefined();
      expect(limit?.maxPerSession).toBe(5);
    });
  });

  describe('getBudgetSummary', () => {
    it('returns formatted summary', async () => {
      const { getBudgetSummary } = await import('../cli/budget');
      const summary = getBudgetSummary();
      expect(summary).toContain('AGENT BEHAVIOR BUDGET');
      expect(summary).toContain('ACTIVE');
      expect(summary).toContain('commits');
      expect(summary).toContain('edits');
    });
  });
});
