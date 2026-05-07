// ANSI helpers + table/format utilities for the preview CLI.

const enabled = process.stdout.isTTY && process.env.NO_COLOR !== '1';

const code = (open: string, close: string) =>
  enabled ? (s: string) => `\x1b[${open}m${s}\x1b[${close}m` : (s: string) => s;

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

export const ok = (s: string) => `${c.green('✓')} ${s}`;
export const warn = (s: string) => `${c.yellow('!')} ${s}`;
export const err = (s: string) => `${c.red('✗')} ${s}`;
export const info = (s: string) => `${c.blue('i')} ${s}`;
export const mock = (s: string) => `${c.gray('[mock]')} ${s}`;

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

export function formatUptime(startedAt: string | null): string {
  if (!startedAt) return '-';
  const ms = Date.now() - new Date(startedAt).getTime();
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return c.gray('never');
  return `${new Date(iso).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

export function rule(width = 50): string {
  return c.gray('─'.repeat(width));
}

export interface Column {
  header: string;
  width: number;
  format?: (raw: string) => string;
}

export function table(columns: Column[], rows: string[][]): string {
  const lines: string[] = [];
  lines.push(columns.map((col) => c.bold(col.header.padEnd(col.width))).join(' '));
  lines.push(rule(columns.reduce((w, c2) => w + c2.width + 1, 0)));
  for (const row of rows) {
    lines.push(
      row
        .map((cell, idx) => {
          const col = columns[idx];
          if (!col) return cell;
          const padded = stripAnsi(cell).padEnd(col.width);
          // restore ansi: pad on the visible part, keep original cell prefix where colors live
          return cell + ' '.repeat(Math.max(0, padded.length - stripAnsi(cell).length));
        })
        .join(' '),
    );
  }
  return lines.join('\n');
}

function stripAnsi(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ESC (\x1b) is the literal start of every ANSI escape; that is the whole point.
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}
