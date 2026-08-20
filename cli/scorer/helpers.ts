import fs from 'fs';
import path from 'path';
import type { DomainScorecard } from './types';

export function domainStatus(score: number): DomainScorecard['status'] {
  if (score >= 90) return 'production-ready';
  if (score >= 70) return 'almost-there';
  if (score >= 50) return 'needs-work';
  return 'not-ready';
}

export function avg(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function getExecErrorOutput(e: unknown): string {
  if (e && typeof e === 'object' && 'stdout' in e) return (e as { stdout?: string }).stdout || '';
  if (e && typeof e === 'object' && 'stderr' in e) return (e as { stderr?: string }).stderr || '';
  if (e instanceof Error) return e.message;
  return String(e);
}

export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function fileExists(p: string): boolean {
  return fs.existsSync(path.join(process.cwd(), p));
}

export function dirExists(p: string): boolean {
  const full = path.join(process.cwd(), p);
  return fs.existsSync(full) && fs.statSync(full).isDirectory();
}
