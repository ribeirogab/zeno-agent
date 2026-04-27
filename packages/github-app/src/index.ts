/**
 * @zeno/github-app — stateless GitHub App authentication primitives.
 *
 * - `signAppJwt({appId, privateKey})` — RS256 JWT signed for `iss=<appId>`.
 * - `computePemSha256(privateKey)` — fingerprint for UI display.
 * - `looksLikePem(value)` — best-effort PEM shape check.
 * - `fetchAppMetadata(jwt)` — GET /app.
 * - `fetchInstallations(jwt)` — GET /app/installations (paginated).
 * - `mintInstallationToken(jwt, instId)` — POST /app/installations/:id/access_tokens.
 * - `fetchInstallationRepoCount(installationToken)` — GET /installation/repositories.
 *
 * Worker wraps these in a stateful cache (`GitHubAppAuth`); API calls them
 * directly. Spec 0044.
 */

export {
  type FetchLike,
  fetchAppMetadata,
  fetchInstallationRepoCount,
  fetchInstallations,
  mintInstallationToken,
} from './github-api.js';
export { computePemSha256, looksLikePem, signAppJwt } from './jwt.js';
export {
  type AppInstallation,
  type AppMetadata,
  GitHubAppError,
  type GitHubAppErrorKind,
  type InstallationToken,
} from './types.js';
