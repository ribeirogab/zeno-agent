import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __testing, rewriteMasterKey } from '@/lib/env-file.js';

const { MANAGED_HEADER, MANAGED_KEY } = __testing;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'envfile-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('rewriteMasterKey', () => {
  it('writes header + key when file does not exist', () => {
    const path = join(dir, '.env');
    rewriteMasterKey(path, 'abc123');
    const content = readFileSync(path, 'utf8');
    expect(content.split('\n')[0]).toBe(MANAGED_HEADER);
    expect(content).toContain(`${MANAGED_KEY}=abc123`);
  });

  it('replaces existing ZENO_MASTER_KEY in place', () => {
    const path = join(dir, '.env');
    writeFileSync(path, `${MANAGED_KEY}=old\nDASHBOARD_PASSWORD=secret\nLOG_LEVEL=info\n`, 'utf8');
    rewriteMasterKey(path, 'new-key');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain(`${MANAGED_KEY}=new-key`);
    expect(content).not.toContain(`${MANAGED_KEY}=old`);
    expect(content).toContain('DASHBOARD_PASSWORD=secret');
    expect(content).toContain('LOG_LEVEL=info');
  });

  it('preserves operator-added keys verbatim', () => {
    const path = join(dir, '.env');
    writeFileSync(path, `${MANAGED_KEY}=k\nMY_CUSTOM=foo\nOTHER=bar\n# comment\n`, 'utf8');
    rewriteMasterKey(path, 'k2');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('MY_CUSTOM=foo');
    expect(content).toContain('OTHER=bar');
    expect(content).toContain('# comment');
  });

  it('header is the first line after rewrite, even if it was elsewhere', () => {
    const path = join(dir, '.env');
    writeFileSync(path, `LOG_LEVEL=info\n${MANAGED_HEADER}\n${MANAGED_KEY}=k\n`, 'utf8');
    rewriteMasterKey(path, 'k2');
    const lines = readFileSync(path, 'utf8').split('\n');
    expect(lines[0]).toBe(MANAGED_HEADER);
    // Old occurrence of header should not duplicate:
    const occurrences = lines.filter((l) => l.trim() === MANAGED_HEADER).length;
    expect(occurrences).toBe(1);
  });

  it('appends ZENO_MASTER_KEY when missing', () => {
    const path = join(dir, '.env');
    writeFileSync(path, `LOG_LEVEL=info\n`, 'utf8');
    rewriteMasterKey(path, 'k');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain(`${MANAGED_KEY}=k`);
    expect(content).toContain('LOG_LEVEL=info');
  });
});
