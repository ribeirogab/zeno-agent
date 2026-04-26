/**
 * In-memory rate limiter for the secret-reveal endpoint. One reveal per
 * (connector, key) per 60s. Spec 0034.
 */

const WINDOW_MS = 60_000;

export class SecretRateLimiter {
  private readonly lastReveal = new Map<string, number>();

  private key(connectorId: string, key: string): string {
    return `${connectorId}::${key}`;
  }

  /**
   * Returns `null` if the call is allowed; otherwise returns seconds-to-wait.
   */
  check(connectorId: string, key: string, now = Date.now()): number | null {
    const k = this.key(connectorId, key);
    const last = this.lastReveal.get(k);
    if (last === undefined) return null;
    const elapsed = now - last;
    if (elapsed >= WINDOW_MS) return null;
    return Math.ceil((WINDOW_MS - elapsed) / 1000);
  }

  record(connectorId: string, key: string, now = Date.now()): void {
    this.lastReveal.set(this.key(connectorId, key), now);
  }
}
