// Test helper: build the (Cookie + X-CSRF-Token) headers needed to satisfy
// the CSRF double-submit middleware on mutating routes. Reads pass without
// these headers; we still attach them so the same fixture works for both.

import { COOKIE_NAME, HEADER_NAME } from '@/csrf/middleware';

const TEST_TOKEN = 'a'.repeat(64);

export function csrfHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Cookie: `${COOKIE_NAME}=${TEST_TOKEN}`,
    [HEADER_NAME]: TEST_TOKEN,
    ...extra,
  };
}
