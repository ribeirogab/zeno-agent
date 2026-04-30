/**
 * Spec 0059: per-catalog setup helpers surfaced inside the install modal.
 *
 * For Slack: 3 numbered steps + the contents of `infra/slack-app-manifest.json`
 * read synchronously at request time. The file is part of the worker image
 * (`infra/Dockerfile` copies the whole repo). Resolution is anchored to
 * `process.cwd()` because the test setup chdirs to the worktree root and the
 * Dockerfile sets WORKDIR to `/app` — both reach `infra/slack-app-manifest.json`
 * correctly.
 *
 * Future channels (Telegram, WhatsApp, etc.) plug in here. Catalog entries
 * without a manifest return `manifest: null` and steps only.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

export type SetupStep = { index: number; html: string };
export type SetupManifest = { filename: string; content: string };
export interface ChannelSetupHelper {
  steps: SetupStep[];
  manifest: SetupManifest | null;
}

const SLACK_STEPS: SetupStep[] = [
  {
    index: 1,
    html: 'Open <code>api.slack.com/apps</code> → <strong>Create New App</strong> → <strong>From an app manifest</strong> → pick your workspace.',
  },
  {
    index: 2,
    html: 'Paste the manifest below. Review and create the app.',
  },
  {
    index: 3,
    html: 'Generate an <strong>App-Level Token</strong> with scope <code>connections:write</code> and install the bot to your workspace. Copy both tokens here.',
  },
];

function resolveSlackManifestContent(): string | null {
  const candidatePaths = [
    path.resolve(process.cwd(), 'infra/slack-app-manifest.json'),
    // Fallback when the test harness or build environment doesn't chdir
    path.resolve(process.cwd(), '../../infra/slack-app-manifest.json'),
  ];
  for (const p of candidatePaths) {
    try {
      return readFileSync(p, 'utf-8');
    } catch {
      // try next
    }
  }
  return null;
}

export function getChannelSetupHelper(catalogId: string): ChannelSetupHelper | null {
  if (catalogId === 'slack') {
    const content = resolveSlackManifestContent();
    return {
      steps: SLACK_STEPS,
      manifest: content ? { filename: 'slack-app-manifest.json', content } : null,
    };
  }
  return null;
}
