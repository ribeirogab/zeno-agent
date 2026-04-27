/**
 * Stateless GitHub API client for App authentication endpoints.
 * Spec 0044.
 *
 * No caching, no timers — `GitHubAppAuth` (worker) wraps these with the token
 * cache + refresh interval. The API process uses these directly for install/
 * test/discover endpoints.
 */

import {
  type AppInstallation,
  type AppMetadata,
  GitHubAppError,
  type GitHubAppErrorKind,
  type InstallationToken,
} from './types.js';

const GITHUB_API_BASE = 'https://api.github.com';
const COMMON_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'zeno-agent',
} as const;

/**
 * For tests/dependency injection. The default uses the global fetch.
 * Keep the contract narrow: only the bits we actually use.
 */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

function classifyHttpStatus(status: number): GitHubAppErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  return 'unknown';
}

async function readError(
  res: { status: number; text: () => Promise<string> },
  prefix: string,
): Promise<GitHubAppError> {
  let body = '';
  try {
    body = await res.text();
  } catch {
    // body unreadable; carry on with status only
  }
  const truncated = body.slice(0, 500);
  return new GitHubAppError(
    `${prefix}: ${res.status}${truncated ? ` ${truncated}` : ''}`,
    classifyHttpStatus(res.status),
    res.status,
  );
}

function networkError(prefix: string, err: unknown): GitHubAppError {
  const message = err instanceof Error ? err.message : String(err);
  return new GitHubAppError(`${prefix}: ${message}`, 'network', null);
}

interface Deps {
  fetch?: FetchLike;
}

interface RawAppMetadata {
  id: number;
  slug: string;
  name: string;
}

interface RawInstallation {
  id: number;
  account: { login: string; type: string } | null;
  permissions: Record<string, string>;
  repository_selection: 'all' | 'selected';
}

interface RawInstallationListItem {
  total_count: number;
}

/**
 * GET /app — returns metadata for the App identified by the JWT.
 * Used to validate {appId, pem} pairs at install time and to backfill
 * `app_slug`/`app_name` post-migration.
 */
export async function fetchAppMetadata(jwt: string, deps: Deps = {}): Promise<AppMetadata> {
  const fetchImpl = deps.fetch ?? (globalThis.fetch as FetchLike);
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(`${GITHUB_API_BASE}/app`, {
      method: 'GET',
      headers: { ...COMMON_HEADERS, Authorization: `Bearer ${jwt}` },
    });
  } catch (err) {
    throw networkError('fetchAppMetadata', err);
  }
  if (!res.ok) throw await readError(res, 'fetchAppMetadata');
  const raw = (await res.json()) as RawAppMetadata;
  return {
    appId: String(raw.id),
    slug: raw.slug,
    name: raw.name,
  };
}

/**
 * GET /app/installations — lists every installation of this App.
 * Used by the dashboard "auto-discover installations" flow.
 *
 * Note: GitHub paginates at 30 per page by default. Single user with <50
 * installs realistically — we follow `Link: rel="next"` if present but cap at
 * 10 pages to avoid infinite loops on a misbehaving server.
 */
export async function fetchInstallations(jwt: string, deps: Deps = {}): Promise<AppInstallation[]> {
  const fetchImpl = deps.fetch ?? (globalThis.fetch as FetchLike);
  const out: AppInstallation[] = [];
  let url: string | null = `${GITHUB_API_BASE}/app/installations?per_page=100`;
  let pages = 0;
  while (url && pages < 10) {
    let res: Awaited<ReturnType<FetchLike>> & { headers?: { get(name: string): string | null } };
    try {
      res = (await fetchImpl(url, {
        method: 'GET',
        headers: { ...COMMON_HEADERS, Authorization: `Bearer ${jwt}` },
      })) as typeof res;
    } catch (err) {
      throw networkError('fetchInstallations', err);
    }
    if (!res.ok) throw await readError(res, 'fetchInstallations');
    const raw = (await res.json()) as RawInstallation[];
    for (const inst of raw) {
      out.push({
        id: String(inst.id),
        account: inst.account?.login ?? '',
        accountType: inst.account?.type ?? '',
        repoCount: inst.repository_selection === 'all' ? null : 0,
        permissions: inst.permissions ?? {},
      });
    }
    const link = res.headers?.get('link') ?? null;
    url = parseNextLink(link);
    pages += 1;
  }
  return out;
}

/**
 * POST /app/installations/:id/access_tokens — mint an installation token.
 * Used by the worker token cache and by the API on test/refresh-tools paths.
 */
export async function mintInstallationToken(
  jwt: string,
  installationId: string,
  deps: Deps = {},
): Promise<InstallationToken> {
  const fetchImpl = deps.fetch ?? (globalThis.fetch as FetchLike);
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(`${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: { ...COMMON_HEADERS, Authorization: `Bearer ${jwt}` },
    });
  } catch (err) {
    throw networkError('mintInstallationToken', err);
  }
  if (!res.ok) throw await readError(res, 'mintInstallationToken');
  const raw = (await res.json()) as { token: string; expires_at: string };
  return { token: raw.token, expiresAt: raw.expires_at };
}

/**
 * GET /installation/repositories — counts repos for a single installation.
 * The `fetchInstallations` endpoint reports `repository_selection: 'selected'`
 * but not the count itself. Called per-installation from the discover endpoint
 * when the dashboard needs the count.
 */
export async function fetchInstallationRepoCount(
  installationToken: string,
  deps: Deps = {},
): Promise<number> {
  const fetchImpl = deps.fetch ?? (globalThis.fetch as FetchLike);
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(`${GITHUB_API_BASE}/installation/repositories?per_page=1`, {
      method: 'GET',
      headers: { ...COMMON_HEADERS, Authorization: `Bearer ${installationToken}` },
    });
  } catch (err) {
    throw networkError('fetchInstallationRepoCount', err);
  }
  if (!res.ok) throw await readError(res, 'fetchInstallationRepoCount');
  const raw = (await res.json()) as RawInstallationListItem;
  return raw.total_count;
}

function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  const parts = header.split(',');
  for (const part of parts) {
    const m = part.trim().match(/^<([^>]+)>;\s*rel="next"$/);
    if (m) return m[1] ?? null;
  }
  return null;
}
