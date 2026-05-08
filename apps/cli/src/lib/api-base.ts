// Resolves the local API base URL for a profile by reading its host port from
// the host state DB (~/.zeno/state.db).

import { queries } from '@zeno/db/host';
import { db } from './state.js';

export async function resolveProfileApiUrl(profileName: string): Promise<string> {
  const conn = db();
  const profile = queries.findProfile(conn, profileName);
  if (!profile) {
    throw new Error(`profile '${profileName}' not found`);
  }
  return `http://127.0.0.1:${profile.port}`;
}
