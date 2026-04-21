import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadStaticCrons } from '@/cron/static-loader';

let workdir: string;
const originalCwd = process.cwd();

function writeYaml(content: string): void {
  writeFileSync(join(workdir, 'profile', 'config.yaml'), content, 'utf8');
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'zeno-cron-'));
  // The loader probes /app/profile then ./profile (cwd-relative).
  process.chdir(workdir);
  mkdirSync(join(workdir, 'profile'));
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workdir, { recursive: true, force: true });
});

describe('loadStaticCrons', () => {
  it('returns [] when config.yaml is missing', () => {
    rmSync(join(workdir, 'profile'), { recursive: true });
    expect(loadStaticCrons()).toEqual([]);
  });

  it('returns [] when the file declares an empty list', () => {
    writeYaml('crons: []\n');
    expect(loadStaticCrons()).toEqual([]);
  });

  it('parses a valid entry into a CreateCronInput with source=static', () => {
    writeYaml(`
crons:
  - name: morning-summary
    description: Daily PR summary
    schedule: "0 9 * * 1-5"
    prompt: List open PRs.
    notify:
      conversation_id: C123
`);
    const list = loadStaticCrons(new Date('2026-04-13T05:00:00Z'));
    expect(list).toHaveLength(1);
    const entry = list[0];
    expect(entry?.name).toBe('morning-summary');
    expect(entry?.source).toBe('static');
    expect(entry?.notifyConversationId).toBe('C123');
    expect(entry?.nextRunAt).toBeTypeOf('string');
  });

  it('skips entries with invalid schedule but keeps the others', () => {
    writeYaml(`
crons:
  - name: good
    schedule: "* * * * *"
    prompt: hi
  - name: bad-cron
    schedule: "not a cron"
    prompt: hi
`);
    const list = loadStaticCrons();
    expect(list.map((c) => c.name)).toEqual(['good']);
  });

  it('skips entries with invalid name format', () => {
    writeYaml(`
crons:
  - name: Has Caps And Spaces
    schedule: "* * * * *"
    prompt: hi
`);
    expect(loadStaticCrons()).toEqual([]);
  });

  it('returns [] on malformed yaml', () => {
    writeYaml(': : : not yaml :\n  ::: garbage');
    expect(loadStaticCrons()).toEqual([]);
  });
});
