import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('applyPersona', () => {
  const testDir = path.join(process.cwd(), 'test-tmp-personas');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should throw on invalid persona type', async () => {
    const { applyPersona } = await import('../cli/personas');
    expect(() => applyPersona(testDir, 'invalid' as any)).toThrow('Invalid persona type');
  });

  it('should accept frontend-ux persona type', async () => {
    const { applyPersona } = await import('../cli/personas');
    const result = applyPersona(testDir, 'frontend-ux');
    expect(result).toContain('.cursorrules');
    expect(fs.existsSync(result)).toBe(true);
    const content = fs.readFileSync(result, 'utf-8');
    expect(content).toContain('Frontend UX');
  });

  it('should accept backend-security persona type', async () => {
    const { applyPersona } = await import('../cli/personas');
    const result = applyPersona(testDir, 'backend-security');
    expect(fs.existsSync(result)).toBe(true);
    const content = fs.readFileSync(result, 'utf-8');
    expect(content).toContain('Backend Security');
  });

  it('should accept data-engineer persona type', async () => {
    const { applyPersona } = await import('../cli/personas');
    const result = applyPersona(testDir, 'data-engineer');
    expect(fs.existsSync(result)).toBe(true);
    const content = fs.readFileSync(result, 'utf-8');
    expect(content).toContain('Data Engineer');
  });

  it('should block path traversal attempts', async () => {
    const { applyPersona } = await import('../cli/personas');
    expect(() => applyPersona('../../etc/passwd', 'frontend-ux')).toThrow('Path traversal blocked');
  });
});
