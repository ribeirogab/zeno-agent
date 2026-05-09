import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { confirm, confirmDestructive, promptHidden } from '@/lib/prompt.js';

interface FakeStdin extends PassThrough {
  isTTY: boolean;
  setRawMode: (v: boolean) => void;
}

function fakeIO(opts: { tty?: boolean } = {}): {
  stdin: FakeStdin;
  stdout: PassThrough;
  stderr: PassThrough;
  reads: string[];
  errs: string[];
  exit: ReturnType<typeof vi.fn>;
} {
  const stdin = new PassThrough() as unknown as FakeStdin;
  stdin.isTTY = opts.tty ?? true;
  stdin.setRawMode = vi.fn();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const reads: string[] = [];
  const errs: string[] = [];
  stdout.on('data', (b: Buffer) => reads.push(b.toString()));
  stderr.on('data', (b: Buffer) => errs.push(b.toString()));
  return { stdin, stdout, stderr, reads, errs, exit: vi.fn() };
}

describe('promptHidden', () => {
  it('emits only the label to stdout (no echo)', async () => {
    const io = fakeIO();
    const p = promptHidden('secret', undefined, io);
    setImmediate(() => io.stdin.write('hello\n'));
    expect(await p).toBe('hello');
    expect(io.reads.join('')).toBe('secret: \n');
  });

  it('handles a 64-char paste in a single buffer write', async () => {
    const io = fakeIO();
    const value = 'a'.repeat(64);
    const p = promptHidden('s', undefined, io);
    setImmediate(() => io.stdin.write(`${value}\n`));
    expect(await p).toBe(value);
  });

  it('handles backspace characters', async () => {
    const io = fakeIO();
    const p = promptHidden('s', undefined, io);
    setImmediate(() => io.stdin.write(`abcX\n`));
    expect(await p).toBe('aX');
  });

  it('exits 1 + writes error to stderr in non-TTY', async () => {
    const io = fakeIO({ tty: false });
    await promptHidden('s', undefined, io);
    expect(io.exit).toHaveBeenCalledWith(1);
    expect(io.errs.join('')).toMatch(/not a TTY/);
  });

  it('writes help text before label when provided', async () => {
    const io = fakeIO();
    const p = promptHidden('s', 'this is help', io);
    setImmediate(() => io.stdin.write('x\n'));
    await p;
    expect(io.reads.join('')).toContain('this is help');
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
    const io = fakeIO();
    const p = confirm('?', io);
    setImmediate(() => io.stdin.write(input));
    expect(await p).toBe(expected);
  });
});

describe('confirmDestructive', () => {
  it('returns true when --yes is set (no prompt)', async () => {
    const io = fakeIO();
    expect(await confirmDestructive('do it?', { yes: true }, io)).toBe(true);
    expect(io.reads.join('')).toBe('');
  });

  it('returns false in non-TTY without --yes', async () => {
    const io = fakeIO({ tty: false });
    expect(await confirmDestructive('do it?', { yes: false }, io)).toBe(false);
    expect(io.errs.join('')).toMatch(/--yes in non-interactive/);
  });

  it('delegates to confirm() in TTY without --yes', async () => {
    const io = fakeIO();
    const p = confirmDestructive('do it?', { yes: false }, io);
    setImmediate(() => io.stdin.write('y\n'));
    expect(await p).toBe(true);
  });
});
