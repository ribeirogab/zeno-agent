// ANSI helpers + formatting utilities for the CLI.

let quietMode = false;
let colorEnabled = process.stdout.isTTY && process.env.NO_COLOR !== '1';

export function setQuiet(v: boolean): void {
  quietMode = v;
  if (v) colorEnabled = false;
}

export function isQuiet(): boolean {
  return quietMode;
}

const code = (open: string, close: string) =>
  colorEnabled ? (s: string) => `\x1b[${open}m${s}\x1b[${close}m` : (s: string) => s;

export const c = {
  reset: code('0', '0'),
  bold: code('1', '22'),
  dim: code('2', '22'),
  gray: code('90', '39'),
  red: code('31', '39'),
  green: code('32', '39'),
  yellow: code('33', '39'),
  blue: code('34', '39'),
  cyan: code('36', '39'),
  gold: code('38;5;220', '39'),
};

export const ok = (s: string) => (quietMode ? '' : `${c.green('✓')} ${s}`);
export const warn = (s: string) => (quietMode ? '' : `${c.yellow('!')} ${s}`);
export const err = (s: string) => `${c.red('✗')} ${s}`;
export const info = (s: string) => (quietMode ? '' : `${c.blue('i')} ${s}`);

export type Status = 'running' | 'stopped' | 'failed';

export function statusDot(status: Status): string {
  if (status === 'running') return c.green('●');
  if (status === 'stopped') return c.gray('○');
  return c.red('✗');
}

export function statusLabel(status: Status): string {
  if (status === 'running') return c.green('running');
  if (status === 'stopped') return c.gray('stopped');
  return c.red('failed');
}

export function formatUptime(startedAtMs: number | null): string {
  if (!startedAtMs) return '-';
  const ms = Date.now() - startedAtMs;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatTime(ms: number | null): string {
  if (!ms) return c.gray('never');
  return `${new Date(ms).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

export function rule(width = 50): string {
  return c.gray('─'.repeat(width));
}
