import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCronFile } from '@/cron/frontmatter';
import { rewriteFrontmatter } from '@/cron/rewrite-frontmatter';

describe('parseCronFile', () => {
  it('parses a valid CRON.md', () => {
    const raw = [
      '---',
      'name: Send hello',
      'description: Daily greet',
      "schedule: '0 9 * * 1-5'",
      'enabled: true',
      '---',
      'Say hello to the workspace.',
      '',
    ].join('\n');
    const r = parseCronFile(raw);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.value.name).toBe('Send hello');
      expect(r.value.description).toBe('Daily greet');
      expect(r.value.schedule).toBe('0 9 * * 1-5');
      expect(r.value.enabled).toBe(true);
      expect(r.value.body.trim()).toBe('Say hello to the workspace.');
    }
  });

  it('rejects invalid YAML', () => {
    const r = parseCronFile('---\nname: [unclosed\n---\nbody');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.code).toBe('invalid_yaml');
  });

  it('rejects missing name', () => {
    const r = parseCronFile("---\nschedule: '* * * * *'\nenabled: true\n---\nbody");
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.code).toBe('missing_name');
  });

  it('rejects invalid schedule expression', () => {
    const r = parseCronFile(
      ['---', 'name: x', "schedule: 'not-a-cron'", 'enabled: true', '---', 'body'].join('\n'),
    );
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.code).toBe('invalid_schedule');
  });

  it('rejects non-boolean enabled', () => {
    const r = parseCronFile(
      ['---', 'name: x', "schedule: '* * * * *'", "enabled: 'yes'", '---', 'body'].join('\n'),
    );
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.code).toBe('invalid_enabled_flag');
  });

  it('rejects empty body', () => {
    const r = parseCronFile(
      ['---', 'name: x', "schedule: '* * * * *'", 'enabled: true', '---', '', '', ''].join('\n'),
    );
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.code).toBe('empty_prompt');
  });

  it('treats empty description string as null', () => {
    const r = parseCronFile(
      [
        '---',
        'name: x',
        "schedule: '* * * * *'",
        'enabled: true',
        "description: ''",
        '---',
        'body',
      ].join('\n'),
    );
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value.description).toBeNull();
  });
});

describe('rewriteFrontmatter', () => {
  it('atomically flips enabled in CRON.md without touching body bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cron-rewrite-'));
    const path = join(dir, 'CRON.md');
    const original = [
      '---',
      'name: Test',
      "schedule: '0 9 * * *'",
      'enabled: true',
      '---',
      'Body line one.',
      'Body line two.',
      '',
    ].join('\n');
    writeFileSync(path, original);

    await rewriteFrontmatter(path, (data) => ({ ...data, enabled: false }));

    const after = readFileSync(path, 'utf-8');
    expect(after).toContain('enabled: false');
    expect(after).toContain('Body line one.');
    expect(after).toContain('Body line two.');
    // Body bytes preserved (after the closing ---)
    const bodyAfter = after.split('---').slice(2).join('---');
    const bodyBefore = original.split('---').slice(2).join('---');
    expect(bodyAfter).toBe(bodyBefore);
  });
});
