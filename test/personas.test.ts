import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { applyPersona, PersonaType } from '../cli/personas';

describe('applyPersona', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soloknuckle-personas-'));
    originalCwd = process.cwd();
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should throw on invalid persona type', () => {
    expect(() => applyPersona('test', 'invalid-persona' as PersonaType)).toThrow('Invalid persona type');
  });

  it('should throw on path traversal', () => {
    expect(() => applyPersona('../../etc', 'frontend-ux')).toThrow('Path traversal blocked');
  });

  it('should create .cursorrules for frontend-ux', () => {
    const result = applyPersona('my-app', 'frontend-ux');
    const expected = path.join(tmpDir, 'my-app', '.cursorrules');
    expect(result).toBe(expected);
    expect(fs.existsSync(result)).toBe(true);
    const content = fs.readFileSync(result, 'utf-8');
    expect(content).toContain('Frontend UX Designer');
    expect(content).toContain('Neo-Brutalist');
  });

  it('should create .cursorrules for backend-security', () => {
    const result = applyPersona('svc', 'backend-security');
    expect(fs.existsSync(result)).toBe(true);
    const content = fs.readFileSync(result, 'utf-8');
    expect(content).toContain('paranoid Backend Security Architect');
    expect(content).toContain('RBAC');
  });

  it('should create .cursorrules for data-engineer', () => {
    const result = applyPersona('pipeline', 'data-engineer');
    expect(fs.existsSync(result)).toBe(true);
    const content = fs.readFileSync(result, 'utf-8');
    expect(content).toContain('meticulous Data Engineer');
    expect(content).toContain('query optimization');
  });

  it('should create directory if it does not exist', () => {
    const nested = path.join(tmpDir, 'deep', 'nested', 'dir');
    const result = applyPersona('deep/nested/dir', 'frontend-ux');
    expect(fs.existsSync(nested)).toBe(true);
    expect(fs.existsSync(result)).toBe(true);
  });

  it('should overwrite existing .cursorrules', () => {
    const target = path.join(tmpDir, 'overwrite');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, '.cursorrules'), 'old content');
    applyPersona('overwrite', 'data-engineer');
    const content = fs.readFileSync(path.join(target, '.cursorrules'), 'utf-8');
    expect(content).toContain('Data Engineer');
    expect(content).not.toContain('old content');
  });
});
