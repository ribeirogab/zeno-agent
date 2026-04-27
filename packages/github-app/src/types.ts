/**
 * Public types for the GitHub App API surface used by zeno-agent.
 * Spec 0044.
 */

export interface AppMetadata {
  /** Numeric App ID, returned as a string for consistency with GitHub's other ids. */
  appId: string;
  /** Slug e.g. "acme-bot". Fetched from GET /app. */
  slug: string;
  /** Human-readable App name. */
  name: string;
}

export interface AppInstallation {
  /** Numeric installation id (string). */
  id: string;
  /** Account login owning the install (org or user). */
  account: string;
  /** Account type: 'Organization' | 'User'. */
  accountType: string;
  /** Number of repositories the install has access to (or null if all). */
  repoCount: number | null;
  /** Permission scopes granted (e.g. {contents: 'read', issues: 'write'}). */
  permissions: Record<string, string>;
}

export interface InstallationToken {
  token: string;
  /** ISO timestamp when the token expires. */
  expiresAt: string;
}

/**
 * Errors thrown by the github-app client. Carries a `kind` so callers can
 * branch on the failure mode without parsing message strings.
 */
export type GitHubAppErrorKind =
  | 'auth' // 401/403 → bad PEM / wrong app id / installation revoked
  | 'not_found' // 404 → installation no longer exists
  | 'network' // fetch failed / DNS / connection refused
  | 'rate_limit' // 429 / abuse / secondary rate-limit
  | 'unknown';

export class GitHubAppError extends Error {
  readonly kind: GitHubAppErrorKind;
  readonly status: number | null;
  constructor(message: string, kind: GitHubAppErrorKind, status: number | null = null) {
    super(message);
    this.name = 'GitHubAppError';
    this.kind = kind;
    this.status = status;
  }
}
