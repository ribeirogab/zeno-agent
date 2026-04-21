import { existsSync, type FSWatcher, watch } from 'node:fs';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

/** Logical groupings of identity/config files. The watcher dispatches one group per debounce window. */
type FileGroup = 'prompt' | 'crons' | 'mcp' | 'ignored';

type SourceKind = 'agent' | 'profile';

const AGENT_CANDIDATES = ['/app/agent', 'agent'];
const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

interface ProfileWatcherOptions {
  /** Called when SOUL.md (agent/) or USER.md (profile/) changes. */
  onPromptFilesChanged: () => void;
  /** Called when profile/config.yaml changes. */
  onCronsChanged: () => void;
  /** Called when agent/mcp.json or profile/mcp.json changes. */
  onMcpChanged: () => void;
  /** Debounce window in ms. Defaults to 250 — enough to coalesce editor save bursts. */
  debounceMs?: number;
}

/**
 * Watches both agent/ and profile/ for hot-reloadable changes. Native fs.watch
 * (recursive) — no extra deps. Editor saves emit 5+ events; we coalesce per
 * group with a trailing-edge debounce.
 */
export class ProfileWatcher {
  private readonly watchers: FSWatcher[] = [];
  private readonly timers = new Map<FileGroup, NodeJS.Timeout>();
  private readonly debounceMs: number;

  constructor(private readonly opts: ProfileWatcherOptions) {
    this.debounceMs = opts.debounceMs ?? 250;
  }

  start(): void {
    if (this.watchers.length > 0) return;

    const agentPath = findSourceDir(AGENT_CANDIDATES);
    if (agentPath) {
      this.watchers.push(this.openWatcher('agent', agentPath));
      logger.info({ event: 'profile_watcher_started', source: 'agent', path: agentPath });
    } else {
      logger.warn({ event: 'profile_watcher_no_dir', source: 'agent' });
    }

    const profilePath = findSourceDir(PROFILE_CANDIDATES);
    if (profilePath) {
      this.watchers.push(this.openWatcher('profile', profilePath));
      logger.info({ event: 'profile_watcher_started', source: 'profile', path: profilePath });
    } else {
      logger.warn({ event: 'profile_watcher_no_dir', source: 'profile' });
    }
  }

  stop(): void {
    for (const w of this.watchers) w.close();
    this.watchers.length = 0;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private openWatcher(source: SourceKind, path: string): FSWatcher {
    return watch(path, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const group = classify(source, filename);
      if (group === 'ignored') return;
      this.schedule(group);
    });
  }

  private schedule(group: FileGroup): void {
    const existing = this.timers.get(group);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(group);
      this.dispatch(group);
    }, this.debounceMs);
    this.timers.set(group, timer);
  }

  private dispatch(group: FileGroup): void {
    try {
      switch (group) {
        case 'prompt':
          this.opts.onPromptFilesChanged();
          break;
        case 'crons':
          this.opts.onCronsChanged();
          break;
        case 'mcp':
          this.opts.onMcpChanged();
          break;
      }
    } catch (error) {
      logger.error(
        { event: 'profile_watcher_handler_failed', group, err: String(error) },
        'profile reload handler threw',
      );
    }
  }
}

function findSourceDir(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Map a (source, filename) pair to its reload group.
 * Anything under skills/ is ignored — Zeno reads those on-demand via Read tool.
 */
export function classify(source: SourceKind, filename: string): FileGroup {
  const normalized = filename.replace(/\\/g, '/');
  if (normalized.startsWith('skills/') || normalized === 'skills') return 'ignored';
  if (source === 'agent' && normalized === 'SOUL.md') return 'prompt';
  if (source === 'profile' && normalized === 'USER.md') return 'prompt';
  if (source === 'profile' && normalized === 'config.yaml') return 'crons';
  if (normalized === 'mcp.json') return 'mcp';
  return 'ignored';
}
