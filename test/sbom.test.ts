import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateSbom, writeSbom } from '../cli/sbom';

const TEST_DIR = path.join(os.tmpdir(), 'soloknuckle-test-sbom');

vi.mock('child_process', () => ({
  execSync: vi.fn(() => 'abc1234'),
}));

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('generateSbom', () => {
  it('returns a valid CycloneDX document', () => {
    const sbom = generateSbom();
    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.specVersion).toBe('1.5');
    expect(sbom.version).toBe(1);
    expect(sbom.metadata.tools).toEqual([{ name: 'soloknuckle', version: '0.0.0' }]);
    expect(Array.isArray(sbom.components)).toBe(true);
  });

  it('includes dependencies from package.json', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
      name: 'test-app',
      version: '1.0.0',
      dependencies: { express: '^4.18.0', lodash: '4.17.21' },
    }, null, 2));

    const sbom = generateSbom();
    const names = sbom.components.map(c => c.name);
    expect(names).toContain('express');
    expect(names).toContain('lodash');
  });

  it('deduplicates deps', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
      name: 'test-app',
      dependencies: { express: '4.18.0' },
    }, null, 2));

    const sbom = generateSbom();
    const expressCount = sbom.components.filter(c => c.name === 'express').length;
    expect(expressCount).toBe(1);
  });

  it('strips version prefixes', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
      name: 'test-app',
      dependencies: { express: '^4.18.0' },
    }, null, 2));

    const sbom = generateSbom();
    const express = sbom.components.find(c => c.name === 'express');
    expect(express?.version).toBe('4.18.0');
    expect(express?.purl).toBe('pkg:npm/express@4.18.0');
  });

  it('includes project itself when license is set', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
      name: 'my-app',
      version: '2.0.0',
      license: 'ISC',
      dependencies: {},
    }, null, 2));

    const sbom = generateSbom();
    const app = sbom.components.find(c => c.type === 'application');
    expect(app).toBeDefined();
    expect(app?.name).toBe('my-app');
    expect(app?.version).toBe('2.0.0');
    expect(app?.licenses).toEqual([{ id: 'ISC' }]);
  });

  it('includes lock file deps not in package.json', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
      name: 'test-app',
      dependencies: {},
    }, null, 2));
    fs.writeFileSync(path.join(TEST_DIR, 'package-lock.json'), JSON.stringify({
      packages: {
        '': { name: 'test-app', version: '1.0.0' },
        'node_modules/express': { version: '4.18.2' },
        'node_modules/lodash': { version: '4.17.21' },
      },
    }, null, 2));

    const sbom = generateSbom();
    const names = sbom.components.map(c => c.name);
    expect(names).toContain('express');
    expect(names).toContain('lodash');
  });
});

describe('writeSbom', () => {
  it('writes SBOM to default location', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
      name: 'test-app',
      dependencies: { express: '4.18.0' },
    }, null, 2));

    const outPath = writeSbom();
    expect(outPath).toContain('.soloknuckle');
    expect(outPath).toContain('sbom.json');
    expect(fs.existsSync(outPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(content.bomFormat).toBe('CycloneDX');
    expect(content.components.length).toBeGreaterThanOrEqual(1);
  });

  it('writes SBOM to custom location', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
      name: 'test-app',
      dependencies: {},
    }, null, 2));

    const customDir = path.join(TEST_DIR, 'custom-output');
    const outPath = writeSbom(customDir);
    expect(outPath).toBe(path.join(customDir, 'sbom.json'));
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it('creates output directory if missing', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'package.json'), JSON.stringify({
      name: 'test-app',
      dependencies: {},
    }, null, 2));

    const nestedDir = path.join(TEST_DIR, 'a', 'b', 'c');
    const outPath = writeSbom(nestedDir);
    expect(fs.existsSync(outPath)).toBe(true);
  });
});
