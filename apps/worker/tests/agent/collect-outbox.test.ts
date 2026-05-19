import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectOutbox } from '@/agent/collect-outbox';

describe('collectOutbox', () => {
  let outboxDir: string;

  beforeEach(() => {
    outboxDir = join(tmpdir(), `zeno-outbox-test-${randomUUID()}`);
    mkdirSync(outboxDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(outboxDir)) {
      rmSync(outboxDir, { recursive: true, force: true });
    }
  });

  it('returns [] for empty dir', async () => {
    const result = await collectOutbox(outboxDir);
    expect(result).toEqual([]);
  });

  it('returns [] when the dir does not exist', async () => {
    rmSync(outboxDir, { recursive: true, force: true });
    const result = await collectOutbox(outboxDir);
    expect(result).toEqual([]);
  });

  it('returns one attachment for one regular file', async () => {
    writeFileSync(join(outboxDir, 'places.json'), '[{"name":"x"}]');
    const result = await collectOutbox(outboxDir);
    expect(result).toEqual([
      {
        name: 'places.json',
        mimetype: 'application/json',
        localPath: join(outboxDir, 'places.json'),
        sizeBytes: 14,
      },
    ]);
  });

  it('returns multiple files sorted alphabetically by name', async () => {
    writeFileSync(join(outboxDir, 'zeta.md'), '# zeta');
    writeFileSync(join(outboxDir, 'alpha.json'), '{"a":1}');
    writeFileSync(join(outboxDir, 'mid.csv'), 'a,b\n');
    const result = await collectOutbox(outboxDir);
    expect(result.map((a) => a.name)).toEqual(['alpha.json', 'mid.csv', 'zeta.md']);
    expect(result.map((a) => a.mimetype)).toEqual([
      'application/json',
      'text/csv',
      'text/markdown',
    ]);
  });

  it('uses application/octet-stream for unknown extensions', async () => {
    writeFileSync(join(outboxDir, 'mystery.xyz'), 'whatever');
    const result = await collectOutbox(outboxDir);
    expect(result).toHaveLength(1);
    expect(result[0].mimetype).toBe('application/octet-stream');
  });

  it('uses application/octet-stream when no extension', async () => {
    writeFileSync(join(outboxDir, 'README'), 'no ext');
    const result = await collectOutbox(outboxDir);
    expect(result).toHaveLength(1);
    expect(result[0].mimetype).toBe('application/octet-stream');
  });

  it('skips files larger than 50 MB', async () => {
    writeFileSync(join(outboxDir, 'ok.txt'), 'small');
    const huge = Buffer.alloc(51 * 1024 * 1024);
    writeFileSync(join(outboxDir, 'huge.bin'), huge);
    const result = await collectOutbox(outboxDir);
    expect(result.map((a) => a.name)).toEqual(['ok.txt']);
  });

  it('skips subdirectories (does not recurse)', async () => {
    writeFileSync(join(outboxDir, 'top.txt'), 'top');
    mkdirSync(join(outboxDir, 'sub'));
    writeFileSync(join(outboxDir, 'sub', 'nested.txt'), 'deep');
    const result = await collectOutbox(outboxDir);
    expect(result.map((a) => a.name)).toEqual(['top.txt']);
  });

  it('skips symlinks whose realpath is outside the outbox', async () => {
    writeFileSync(join(outboxDir, 'ok.txt'), 'fine');
    const externalDir = join(tmpdir(), `zeno-external-${randomUUID()}`);
    mkdirSync(externalDir, { recursive: true });
    writeFileSync(join(externalDir, 'secret.txt'), 'private');
    try {
      symlinkSync(join(externalDir, 'secret.txt'), join(outboxDir, 'leak.txt'));
      const result = await collectOutbox(outboxDir);
      expect(result.map((a) => a.name)).toEqual(['ok.txt']);
    } finally {
      rmSync(externalDir, { recursive: true, force: true });
    }
  });
});
