import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import yaml from 'js-yaml';
import { ManifestSchema, type Manifest } from './manifest.js';

export function loadManifest(path: string): Manifest {
  const raw = readFileSync(path, 'utf8');
  const parsed = yaml.load(raw);
  return ManifestSchema.parse(parsed);
}

export function saveManifest(path: string, manifest: Manifest): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, yaml.dump(manifest, { lineWidth: 120, noRefs: true }), 'utf8');
}

export function manifestToYaml(manifest: Manifest): string {
  return yaml.dump(manifest, { lineWidth: 120, noRefs: true });
}
