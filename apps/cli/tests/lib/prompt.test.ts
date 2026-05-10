import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { confirm, confirmDestructive, promptHidden } from '@/lib/prompt.js';

interface FakeStdin extends PassThrough {
  isTTY: boolean;
  setRawMode: (v: boolean) => void;
}

type IO = Parameters<typeof promptHidden>[2];

interface FakeIO {
  io: IO;
  stdin: FakeStdin;
  reads: string[];
  errs: string[];
  exit: ReturnType<typeof vi.fn>;
}

function fakeIO(opts: { tty?: boolean } = {}): FakeIO {
  const stdin = new PassThrough() as unknown as FakeStdin;
  stdin.isTTY = opts.tty ?? true;
  stdin.setRawMode = vi.fn();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const reads: string[] = [];
  const errs: string[] = [];
  stdout.on('data', (b: Buffer) => reads.push(b.toString()));
  stderr.on('data', (b: Buffer) => errs.push(b.toString()));
  const exit = vi.fn();
  const io: IO = {
    stdin,
    stdout,
    stderr,
    exit: exit as unknown as (code: number) => unknown,
  };
  return { io, stdin, reads, errs, exit };
}

describe('promptHidden', () => {
  it('echoes a masked * per char + label + newline on submit', async () => {
    const f = fakeIO();
    const p = promptHidden('secret', undefined, f.io);
    setImmediate(() => f.stdin.write('hello\n'));
    expect(await p).toBe('hello');
    // label, then one '*' per typed char, then '\n' on submit.
    expect(f.reads.join('')).toBe(`secret: ${'*'.repeat(5)}\n`);
  });

  it('handles a 64-char paste in a single buffer write', async () => {
    const f = fakeIO();
    const value = 'a'.repeat(64);
    const p = promptHidden('s', undefined, f.io);
    setImmediate(() => f.stdin.write(`${value}\n`));
    expect(await p).toBe(value);
    // label + 64 stars + newline.
    expect(f.reads.join('')).toBe(`s: ${'*'.repeat(64)}\n`);
  });

  it('handles backspace characters and erases a star', async () => {
    const f = fakeIO();
    const p = promptHidden('s', undefined, f.io);
    // 'a','b','c', backspace (\x7f), 'X' → buffer becomes 'abX'
    setImmediate(() => f.stdin.write(`abc\x7fX\n`));
    expect(await p).toBe('abX');
    // s: ***\b \b*\n  (3 stars, then \b<space>\b erases one, then 'X' → '*')
    expect(f.reads.join('')).toBe('s: ***\b \b*\n');
  });

  it('does not write past the start when backspacing on an empty buffer', async () => {
    const f = fakeIO();
    const p = promptHidden('s', undefined, f.io);
    setImmediate(() => f.stdin.write(`\x7f\x7fa\n`));
    expect(await p).toBe('a');
    // Two no-op backspaces (no \b sent), then '*' for the 'a'.
    expect(f.reads.join('')).toBe('s: *\n');
  });

  it('exits 1 + writes error to stderr in non-TTY', async () => {
    const f = fakeIO({ tty: false });
    await promptHidden('s', undefined, f.io);
    expect(f.exit).toHaveBeenCalledWith(1);
    expect(f.errs.join('')).toMatch(/not a TTY/);
  });

  it('writes help text before label when provided', async () => {
    const f = fakeIO();
    const p = promptHidden('s', 'this is help', f.io);
    setImmediate(() => f.stdin.write('x\n'));
    await p;
    expect(f.reads.join('')).toContain('this is help');
  });
});

describe('confirm', () => {
  it.each([
    ['y\n', true],
    ['Y\n', true],
    ['yes\n', true],
    ['YES\n', true],
    ['n\n', false],
    ['no\n', false],
    ['\n', false],
    ['anything\n', false],
  ])('parses %s as %s', async (input, expected) => {
    const f = fakeIO();
    const p = confirm('?', f.io);
    setImmediate(() => f.stdin.write(input));
    expect(await p).toBe(expected);
  });
});

describe('confirmDestructive', () => {
  it('returns true when --yes is set (no prompt)', async () => {
    const f = fakeIO();
    expect(await confirmDestructive('do it?', { yes: true }, f.io)).toBe(true);
    expect(f.reads.join('')).toBe('');
  });

  it('returns false in non-TTY without --yes', async () => {
    const f = fakeIO({ tty: false });
    expect(await confirmDestructive('do it?', { yes: false }, f.io)).toBe(false);
    expect(f.errs.join('')).toMatch(/--yes in non-interactive/);
  });

  it('delegates to confirm() in TTY without --yes', async () => {
    const f = fakeIO();
    const p = confirmDestructive('do it?', { yes: false }, f.io);
    setImmediate(() => f.stdin.write('y\n'));
    expect(await p).toBe(true);
  });
});
