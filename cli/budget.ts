import fs from 'fs';
import path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BudgetUnit = 'commits' | 'edits' | 'deploys' | 'api-calls';

export interface BudgetLimit {
  unit: BudgetUnit;
  maxPerSession: number;
  maxPerDay: number;
}

export interface BudgetRecord {
  timestamp: string;
  action: string;
  unit: BudgetUnit;
  count: number;
  metadata?: Record<string, unknown>;
}

export interface BudgetState {
  limits: BudgetLimit[];
  paused: boolean;
  pauseReason?: string;
  pausedAt?: string;
  session: {
    id: string;
    startedAt: string;
    actions: BudgetRecord[];
    totals: Record<BudgetUnit, number>;
  };
  daily: {
    date: string;
    totals: Record<BudgetUnit, number>;
  };
}

// ─── Persistence ────────────────────────────────────────────────────────────

function getDataDir(): string {
  const dir = path.join(process.cwd(), '.soloknuckle');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getBudgetFile(): string {
  return path.join(getDataDir(), 'budget.json');
}

const DEFAULT_LIMITS: BudgetLimit[] = [
  { unit: 'commits', maxPerSession: 20, maxPerDay: 50 },
  { unit: 'edits', maxPerSession: 100, maxPerDay: 300 },
  { unit: 'deploys', maxPerSession: 5, maxPerDay: 10 },
  { unit: 'api-calls', maxPerSession: 200, maxPerDay: 1000 },
];

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function createFreshState(): BudgetState {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  return {
    limits: [...DEFAULT_LIMITS],
    paused: false,
    session: {
      id: sessionId,
      startedAt: new Date().toISOString(),
      actions: [],
      totals: { commits: 0, edits: 0, deploys: 0, 'api-calls': 0 },
    },
    daily: {
      date: getToday(),
      totals: { commits: 0, edits: 0, deploys: 0, 'api-calls': 0 },
    },
  };
}

export function loadBudget(): BudgetState {
  const file = getBudgetFile();
  if (fs.existsSync(file)) {
    try {
      const data: BudgetState = JSON.parse(fs.readFileSync(file, 'utf-8'));
      // Reset session on new day
      if (data.daily.date !== getToday()) {
        data.daily = {
          date: getToday(),
          totals: { commits: 0, edits: 0, deploys: 0, 'api-calls': 0 },
        };
      }
      return data;
    } catch {
      // corrupted
    }
  }
  return createFreshState();
}

export function saveBudget(state: BudgetState): void {
  fs.writeFileSync(getBudgetFile(), JSON.stringify(state, null, 2));
}

// ─── Core Logic ─────────────────────────────────────────────────────────────

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  unit: BudgetUnit;
  current: number;
  limit: number;
  resetIn?: string;
}

/**
 * Checks if an action is within budget limits.
 */
export function checkBudget(state: BudgetState, unit: BudgetUnit, count: number = 1): BudgetCheckResult {
  if (state.paused) {
    return {
      allowed: false,
      reason: state.pauseReason || 'Budget paused by administrator.',
      unit,
      current: 0,
      limit: 0,
    };
  }

  const limit = state.limits.find(l => l.unit === unit);
  if (!limit) {
    // No limit defined for this unit — allow
    return { allowed: true, unit, current: 0, limit: Infinity };
  }

  const sessionTotal = state.session.totals[unit] + count;
  if (sessionTotal > limit.maxPerSession) {
    return {
      allowed: false,
      reason: `Session limit exceeded for ${unit}: ${state.session.totals[unit]}/${limit.maxPerSession}. Reset on next session.`,
      unit,
      current: state.session.totals[unit],
      limit: limit.maxPerSession,
    };
  }

  const dailyTotal = state.daily.totals[unit] + count;
  if (dailyTotal > limit.maxPerDay) {
    return {
      allowed: false,
      reason: `Daily limit exceeded for ${unit}: ${state.daily.totals[unit]}/${limit.maxPerDay}. Resets at midnight.`,
      unit,
      current: state.daily.totals[unit],
      limit: limit.maxPerDay,
      resetIn: 'midnight',
    };
  }

  return {
    allowed: true,
    unit,
    current: sessionTotal,
    limit: limit.maxPerSession,
  };
}

/**
 * Records an action. Auto-pauses if over budget.
 */
export function recordAction(
  action: string,
  unit: BudgetUnit,
  count: number = 1,
  metadata?: Record<string, unknown>,
): { state: BudgetState; check: BudgetCheckResult } {
  const state = loadBudget();
  const check = checkBudget(state, unit, count);

  if (!check.allowed) {
    state.paused = true;
    state.pauseReason = check.reason;
    state.pausedAt = new Date().toISOString();
    saveBudget(state);
    return { state, check };
  }

  state.session.totals[unit] += count;
  state.daily.totals[unit] += count;
  state.session.actions.push({
    timestamp: new Date().toISOString(),
    action,
    unit,
    count,
    metadata,
  });

  saveBudget(state);
  return { state, check };
}

/**
 * Pauses the budget manually.
 */
export function pauseBudget(reason: string): BudgetState {
  const state = loadBudget();
  state.paused = true;
  state.pauseReason = reason;
  state.pausedAt = new Date().toISOString();
  saveBudget(state);
  return state;
}

/**
 * Resumes the budget and optionally resets session totals.
 */
export function resumeBudget(resetSession: boolean = false): BudgetState {
  const state = loadBudget();
  state.paused = false;
  state.pauseReason = undefined;
  state.pausedAt = undefined;

  if (resetSession) {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    state.session = {
      id: sessionId,
      startedAt: new Date().toISOString(),
      actions: [],
      totals: { commits: 0, edits: 0, deploys: 0, 'api-calls': 0 },
    };
  }

  saveBudget(state);
  return state;
}

/**
 * Updates a limit for a specific unit.
 */
export function setLimit(unit: BudgetUnit, maxPerSession: number, maxPerDay: number): BudgetState {
  const state = loadBudget();
  const existing = state.limits.find(l => l.unit === unit);
  if (existing) {
    existing.maxPerSession = maxPerSession;
    existing.maxPerDay = maxPerDay;
  } else {
    state.limits.push({ unit, maxPerSession, maxPerDay });
  }
  saveBudget(state);
  return state;
}

/**
 * Returns a human-readable summary of the current budget state.
 */
export function getBudgetSummary(): string {
  const state = loadBudget();
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('  AGENT BEHAVIOR BUDGET');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push(`  Status: ${state.paused ? '🔴 PAUSED' : '🟢 ACTIVE'}`);
  if (state.paused) {
    lines.push(`  Reason: ${state.pauseReason}`);
    lines.push(`  Paused at: ${state.pausedAt}`);
  }
  lines.push(`  Session: ${state.session.id}`);
  lines.push(`  Started: ${state.session.startedAt}`);
  lines.push('───────────────────────────────────────────────────────');

  lines.push('  Limits:');
  for (const limit of state.limits) {
    const s = state.session.totals[limit.unit] || 0;
    const d = state.daily.totals[limit.unit] || 0;
    const sPct = limit.maxPerSession > 0 ? Math.round((s / limit.maxPerSession) * 100) : 0;
    const dPct = limit.maxPerDay > 0 ? Math.round((d / limit.maxPerDay) * 100) : 0;
    const sBar = '█'.repeat(Math.min(sPct / 10, 10)) + '░'.repeat(10 - Math.min(sPct / 10, 10));
    const dBar = '█'.repeat(Math.min(dPct / 10, 10)) + '░'.repeat(10 - Math.min(dPct / 10, 10));
    lines.push(`    ${limit.unit}:`);
    lines.push(`      Session: [${sBar}] ${s}/${limit.maxPerSession} (${sPct}%)`);
    lines.push(`      Daily:   [${dBar}] ${d}/${limit.maxPerDay} (${dPct}%)`);
  }

  lines.push('───────────────────────────────────────────────────────');
  lines.push(`  Actions this session: ${state.session.actions.length}`);

  // Show last 5 actions
  const recent = state.session.actions.slice(-5);
  if (recent.length > 0) {
    for (const action of recent) {
      const time = new Date(action.timestamp).toLocaleTimeString();
      lines.push(`    [${time}] ${action.action} (+${action.count} ${action.unit})`);
    }
  }

  lines.push('═══════════════════════════════════════════════════════');
  return lines.join('\n');
}
