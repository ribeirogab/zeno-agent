// Async spinner. Wraps a long op with a frame animation; falls back to plain text when not a TTY.

import { stdout } from 'node:process';
import { c, err as errLine, ok } from './output.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SpinOptions {
  successText?: string;
  symbol?: 'ok' | 'err';
}

/**
 * Run `fn` while showing a spinner with `text`. On resolve prints the success
 * line; on reject prints the failure line and rethrows. Non-TTY: skips the
 * animation, just prints the final line.
 */
export async function spin<T>(
  text: string,
  fn: () => Promise<T>,
  opts: SpinOptions = {},
): Promise<T> {
  const isTTY = stdout.isTTY;
  const symbol = opts.symbol ?? 'ok';
  const finalText = opts.successText ?? text;

  if (!isTTY) {
    try {
      const result = await fn();
      stdout.write(`${ok(finalText)}\n`);
      return result;
    } catch (e) {
      stdout.write(`${errLine(text)}\n`);
      throw e;
    }
  }

  stdout.write('\x1b[?25l'); // hide cursor
  let i = 0;
  const timer = setInterval(() => {
    const frame = FRAMES[i % FRAMES.length] ?? '·';
    stdout.write(`\r${c.gold(frame)} ${text}\x1b[K`);
    i++;
  }, 80);

  try {
    const result = await fn();
    clearInterval(timer);
    stdout.write(`\r\x1b[K`);
    stdout.write('\x1b[?25h');
    const line = symbol === 'ok' ? ok(finalText) : errLine(finalText);
    stdout.write(`${line}\n`);
    return result;
  } catch (e) {
    clearInterval(timer);
    stdout.write(`\r\x1b[K`);
    stdout.write('\x1b[?25h');
    stdout.write(`${errLine(text)}\n`);
    throw e;
  }
}
