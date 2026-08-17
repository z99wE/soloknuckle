import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../cli/llm-client', () => ({
  callLLM: vi.fn(),
}));

vi.mock('../cli/telemetry', () => ({
  logTelemetry: vi.fn(),
}));

import { execSync } from 'child_process';
import { generatePRDescription } from '../cli/pr-enforcer';
import { callLLM } from '../cli/llm-client';
import { logTelemetry } from '../cli/telemetry';

const mockCallLLM = vi.mocked(callLLM);
const mockLogTelemetry = vi.mocked(logTelemetry);
const mockExecSync = vi.mocked(execSync);

describe('generatePRDescription', () => {
  const writeSpy = vi.spyOn(fs, 'writeFileSync');

  beforeEach(() => {
    mockCallLLM.mockReset();
    mockLogTelemetry.mockReset();
    writeSpy.mockReset();
    mockExecSync.mockReset();
    mockExecSync.mockReturnValue('');
  });

  it('should generate PR description from diff', async () => {
    mockExecSync.mockReturnValue('diff --git a/file.ts\n+added line');
    mockCallLLM.mockResolvedValue('## Why\nFix bug\n\n## What\n- Patch\n\n## Rollback Plan\nRevert');

    await generatePRDescription('test-key');

    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(mockCallLLM.mock.calls[0][0]).toContain('strict PR generator');
    expect(mockLogTelemetry).toHaveBeenCalledWith(true, expect.any(Number));
    expect(writeSpy).toHaveBeenCalledWith('PR_DESCRIPTION.md', expect.stringContaining('## Why'));
  });

  it('should log error message when callLLM throws', async () => {
    mockExecSync.mockReturnValue('diff --git a/file.ts\n+changed');
    mockCallLLM.mockRejectedValue(new Error('API down'));

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await generatePRDescription('test-key');

    const calls = consoleSpy.mock.calls.flat().join(' ');
    expect(calls).toContain('Failed to generate PR description: API down');
    consoleSpy.mockRestore();
  });

  it('should return early when no diff is found', async () => {
    mockExecSync.mockReturnValue('');

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await generatePRDescription('test-key');

    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(mockLogTelemetry).not.toHaveBeenCalled();
    const calls = consoleSpy.mock.calls.flat().join(' ');
    expect(calls).toContain('No diff found');
    consoleSpy.mockRestore();
  });

  it('should log error for non-Error thrown values', async () => {
    mockExecSync.mockReturnValue('diff --git a/file.ts\n+changed');
    mockCallLLM.mockRejectedValue('string error');

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await generatePRDescription('test-key');

    const calls = consoleSpy.mock.calls.flat().join(' ');
    expect(calls).toContain('string error');
    consoleSpy.mockRestore();
  });
});
