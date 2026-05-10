import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { c, formatUptime, isQuiet, rule, setQuiet, statusDot, statusLabel } from '../lib/output.js';
import { resolveLiveStatus, snapshotLive } from '../lib/profile-state.js';
import { db } from '../lib/state.js';
import type { StatusJson } from '../types/json-output.js';

const TIMEOUT_MS = 1000;

async function fetchWithTimeout<T>(url: string): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default defineCommand({
  meta: {
    name: 'status',
    description: 'overview of all profiles + connector counts + last cron + last error',
  },
  args: {
    json: { type: 'boolean', description: 'emit JSON' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);

    const conn = db();
    const profiles = queries.listProfiles(conn);
    const sticky = queries.getSticky(conn);

    const snap = await snapshotLive();

    const rows: StatusJson[] = await Promise.all(
      profiles.map(async (p): Promise<StatusJson> => {
        const state = resolveLiveStatus(p, snap);
        const uptimeMs = state === 'running' && p.lastStartedAt ? Date.now() - p.lastStartedAt : 0;
        if (state !== 'running') {
          return {
            name: p.name,
            port: p.port,
            state,
            uptimeMs,
            connectorCount: null,
            lastCron: null,
            lastError: null,
          };
        }
        const baseUrl = await resolveProfileApiUrl(p.name).catch(() => null);
        if (!baseUrl) {
          return {
            name: p.name,
            port: p.port,
            state,
            uptimeMs,
            connectorCount: null,
            lastCron: null,
            lastError: null,
          };
        }
        const [connectors, crons, errors] = await Promise.all([
          fetchWithTimeout<unknown[]>(`${baseUrl}/api/connectors`),
          fetchWithTimeout<unknown[]>(`${baseUrl}/api/crons/runs?limit=1`),
          fetchWithTimeout<unknown[]>(`${baseUrl}/api/logs?level=error&limit=1`),
        ]);
        return {
          name: p.name,
          port: p.port,
          state,
          uptimeMs,
          connectorCount: Array.isArray(connectors) ? connectors.length : null,
          lastCron: Array.isArray(crons) && crons.length > 0 ? crons[0] : null,
          lastError: Array.isArray(errors) && errors.length > 0 ? errors[0] : null,
        };
      }),
    );

    if (args.json) {
      process.stdout.write(`${JSON.stringify(rows)}\n`);
      return;
    }

    if (rows.length === 0) {
      console.log(c.gray('No profiles. Create one:'));
      console.log(`  ${c.gold('zeno profile create <profile>')}`);
      return;
    }

    if (!isQuiet()) {
      console.log('');
      console.log(`  ${c.bold('profiles')}`);
      console.log(`  ${rule(70)}`);
    }

    for (const row of rows) {
      const stickyMark = sticky === row.name ? c.gold('*') : ' ';
      const conns = row.connectorCount === null ? '?' : `${row.connectorCount} connectors`;
      const uptime =
        row.state === 'running' && row.uptimeMs > 0 ? formatUptime(Date.now() - row.uptimeMs) : '-';
      console.log(
        `${stickyMark} ${statusDot(row.state)} ${row.name.padEnd(14)} :${String(row.port).padEnd(5)} ${conns.padEnd(15)} ${statusLabel(row.state).padEnd(20)} ${uptime}`,
      );
    }

    const errors = rows
      .filter((r) => r.lastError !== null)
      .map((r) => ({ profile: r.name, err: r.lastError as { message?: string; ts?: number } }));
    const crons = rows
      .filter((r) => r.lastCron !== null)
      .map((r) => ({
        profile: r.name,
        run: r.lastCron as { name?: string; ts?: number; status?: string },
      }));

    if (!isQuiet()) {
      if (crons.length > 0) {
        const last = crons[0];
        if (last) {
          console.log('');
          console.log(
            `  ${c.gray('last cron run:')} ${last.profile} · ${last.run.name ?? '?'} · ${last.run.status ?? '?'}`,
          );
        }
      }
      if (errors.length > 0) {
        const last = errors[0];
        if (last) {
          console.log(`  ${c.gray('last error:')}    ${last.profile} · ${last.err.message ?? '?'}`);
        }
      }
      console.log('');
    }
  },
});
