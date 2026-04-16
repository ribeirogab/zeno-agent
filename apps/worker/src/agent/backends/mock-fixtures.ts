import { existsSync, readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';
import type { Fixture } from '@/agent/backends/mock';

const logger = createLogger({ service: 'worker' });

const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

interface FixtureFileEntry {
  match?: unknown;
  reply?: unknown;
}

interface FixtureFile {
  fixtures?: FixtureFileEntry[];
}

/**
 * Read profile/mock-fixtures.json (optional). Each entry is `{ match, reply }`.
 * Bad regex patterns are skipped + logged so a single typo doesn't disable the file.
 */
export function loadMockFixtures(): Fixture[] {
  const path = findFile('mock-fixtures.json');
  if (!path) return [];

  let parsed: FixtureFile;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    logger.error(
      { event: 'mock_fixtures_invalid', err: String(error) },
      'mock-fixtures.json is malformed, no fixtures loaded',
    );
    return [];
  }

  const out: Fixture[] = [];
  for (const [index, entry] of (parsed.fixtures ?? []).entries()) {
    if (typeof entry.match !== 'string' || typeof entry.reply !== 'string') {
      logger.warn(
        { event: 'mock_fixture_skipped', index, reason: 'shape' },
        'fixture entry missing match/reply strings',
      );
      continue;
    }
    try {
      out.push({ match: new RegExp(entry.match), reply: entry.reply });
    } catch (error) {
      logger.warn(
        { event: 'mock_fixture_skipped', index, reason: 'regex', err: String(error) },
        'fixture has invalid regex',
      );
    }
  }
  logger.info({ event: 'mock_fixtures_loaded', count: out.length }, 'mock fixtures loaded');
  return out;
}

function findFile(name: string): string | null {
  for (const base of PROFILE_CANDIDATES) {
    const path = `${base}/${name}`;
    if (existsSync(path)) return path;
  }
  return null;
}
