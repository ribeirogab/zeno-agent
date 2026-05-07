// Mocked spinner. Wraps an async sleep with a frame animation, falls back to plain text when not a TTY.

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

export async function spin(text: string, ms: number, opts: SpinOptions = {}): Promise<void> {
  const isTTY = stdout.isTTY;
  const symbol = opts.symbol ?? 'ok';
  const finalText = opts.successText ?? text;
  const finalLine = symbol === 'ok' ? ok(finalText) : errLine(finalText);

  if (!isTTY) {
    await sleep(ms);
    stdout.write(`${finalLine}\n`);
    return;
  }

  stdout.write('\x1b[?25l'); // hide cursor
  let i = 0;
  const timer = setInterval(() => {
    const frame = FRAMES[i % FRAMES.length] ?? '·';
    stdout.write(`\r${c.gold(frame)} ${text}\x1b[K`);
    i++;
  }, 80);

  try {
    await sleep(ms);
  } finally {
    clearInterval(timer);
    stdout.write(`\r\x1b[K`);
    stdout.write('\x1b[?25h'); // restore cursor
    stdout.write(`${finalLine}\n`);
  }
}
