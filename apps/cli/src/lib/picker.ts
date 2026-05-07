// Arrow-key list picker for the CLI. Vanilla Node — no extra deps.
// Renders a list of items in raw-mode stdin; ↑/↓ to move, Enter to confirm,
// q or Ctrl-C to abort. Returns the picked index or null on abort.

import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';
import { c } from './output.js';

export interface PickerItem {
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface PickOptions {
  title?: string;
  initialIndex?: number;
}

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_LINE = '\x1b[2K\r';

export async function pick(items: PickerItem[], opts: PickOptions = {}): Promise<number | null> {
  if (items.length === 0) return null;
  if (!stdout.isTTY || !stdin.isTTY) return opts.initialIndex ?? 0;

  let index = clampToEnabled(items, opts.initialIndex ?? 0);
  if (index === -1) return null; // every item disabled

  if (opts.title) stdout.write(`${opts.title}\n`);
  stdout.write(HIDE_CURSOR);

  const render = (first: boolean) => {
    if (!first) {
      // move cursor back up to redraw
      stdout.write(`\x1b[${items.length}A`);
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      const cursor = i === index ? c.gold('›') : ' ';
      const label = it.disabled ? c.gray(it.label) : i === index ? c.bold(it.label) : it.label;
      const hint = it.hint ? `  ${c.gray(it.hint)}` : '';
      stdout.write(`${CLEAR_LINE}${cursor} ${label}${hint}\n`);
    }
  };

  render(true);

  emitKeypressEvents(stdin);
  if (stdin.setRawMode) stdin.setRawMode(true);
  stdin.resume();

  return new Promise<number | null>((resolve) => {
    const cleanup = (result: number | null) => {
      stdin.removeListener('keypress', onKey);
      if (stdin.setRawMode) stdin.setRawMode(false);
      stdin.pause();
      stdout.write(SHOW_CURSOR);
      resolve(result);
    };

    const onKey = (
      _str: string,
      key: { name?: string; ctrl?: boolean; sequence?: string },
    ): void => {
      if (key.ctrl && key.name === 'c') {
        cleanup(null);
        return;
      }
      if (key.name === 'q' || key.name === 'escape') {
        cleanup(null);
        return;
      }
      if (key.name === 'return') {
        cleanup(index);
        return;
      }
      if (key.name === 'up' || key.name === 'k') {
        index = previousEnabled(items, index);
        render(false);
      } else if (key.name === 'down' || key.name === 'j') {
        index = nextEnabled(items, index);
        render(false);
      }
    };

    stdin.on('keypress', onKey);
  });
}

function clampToEnabled(items: PickerItem[], start: number): number {
  if (items[start] && !items[start].disabled) return start;
  for (let i = 0; i < items.length; i++) if (!items[i]?.disabled) return i;
  return -1;
}

function nextEnabled(items: PickerItem[], from: number): number {
  for (let step = 1; step <= items.length; step++) {
    const i = (from + step) % items.length;
    if (!items[i]?.disabled) return i;
  }
  return from;
}

function previousEnabled(items: PickerItem[], from: number): number {
  for (let step = 1; step <= items.length; step++) {
    const i = (from - step + items.length) % items.length;
    if (!items[i]?.disabled) return i;
  }
  return from;
}
