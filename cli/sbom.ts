import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface SbomComponent {
  type: string;
  name: string;
  version: string;
  purl: string;
  licenses?: { id: string }[];
}

interface SbomDocument {
  bomFormat: string;
  specVersion: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: { name: string; version: string }[];
  };
  components: SbomComponent[];
}

function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8', cwd: process.cwd() }).trim();
  } catch {
    return 'unknown';
  }
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function generateSbom(): SbomDocument {
  const components: SbomComponent[] = [];
  const seen = new Set<string>();

  // Read package.json for direct dependencies
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = pkg.dependencies || {};

      for (const [name, version] of Object.entries(allDeps)) {
        if (seen.has(name)) continue;
        seen.add(name);

        components.push({
          type: 'library',
          name,
          version: String(version).replace(/[\^~>=<]/g, ''),
          purl: `pkg:npm/${name}@${String(version).replace(/[\^~>=<]/g, '')}`,
        });
      }
    }
  } catch {
    // skip
  }

  // Try to read lock file for more complete picture
  try {
    const lockPath = path.join(process.cwd(), 'package-lock.json');
    if (fs.existsSync(lockPath)) {
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      const packages = lock.packages || lock.dependencies || {};

      for (const [key, info] of Object.entries(packages)) {
        // package-lock.json v2+ uses "node_modules/name" as keys
        const name = key.replace(/^node_modules\//, '');
        if (!name || name === '' || seen.has(name)) continue;
        seen.add(name);

        const dep = info as { version?: string };
        if (dep.version) {
          components.push({
            type: 'library',
            name,
            version: dep.version,
            purl: `pkg:npm/${name}@${dep.version}`,
          });
        }
      }
    }
  } catch {
    // skip
  }

  // Check for license files
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.license) {
        // Add the project itself as a component
        components.unshift({
          type: 'application',
          name: pkg.name || path.basename(process.cwd()),
          version: pkg.version || '0.0.0',
          purl: `pkg:npm/${pkg.name || path.basename(process.cwd())}@${pkg.version || '0.0.0'}`,
          licenses: [{ id: String(pkg.license) }],
        });
      }
    }
  } catch {
    // skip
  }

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        { name: 'soloknuckle', version: getVersion() },
      ],
    },
    components,
  };
}

export function writeSbom(outputPath?: string): string {
  const sbom = generateSbom();
  const outDir = outputPath || path.join(process.cwd(), '.soloknuckle');
  const outFile = path.join(outDir, 'sbom.json');

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outFile, JSON.stringify(sbom, null, 2) + '\n');
  return outFile;
}
