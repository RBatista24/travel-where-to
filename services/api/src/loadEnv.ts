import { existsSync } from 'node:fs';

/**
 * Loads provider settings and secrets. services/api/.env is preferred; a .env at the
 * repo root also works. Values already in the environment win; the first file wins over the second.
 */
export function loadEnv(): string[] {
  const loaded: string[] = [];
  for (const rel of ['../.env', '../../../.env']) {
    const file = new URL(rel, import.meta.url);
    if (existsSync(file)) {
      process.loadEnvFile(file);
      loaded.push(file.pathname);
    }
  }
  return loaded;
}
