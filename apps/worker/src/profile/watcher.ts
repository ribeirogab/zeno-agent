import { existsSync, type FSWatcher, watch } from 'node:fs';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

/** Logical groupings of profile/ files. The watcher dispatches one group per debounce window. */
type FileGroup = 'prompt' | 'crons' | 'mcp' | 'ignored';

const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

interface ProfileWatcherOptions {
  /** Called when SOUL.md or USER.md changes. */
  onPromptFilesChanged: () => void;
  /** Called when crons.yaml changes. */
  onCronsChanged: () => void;
  /** Called when mcp.json changes. */
  onMcpChanged: () => void;
  /** Debounce window in ms. Defaults to 250 — enough to coalesce editor save bursts. */
  debounceMs?: number;
}

/**
 * Watches profile/ for hot-reloadable changes. Native fs.watch (recursive) — no extra deps.
 * Editor saves emit 5+ events; we coalesce per group with a trailing-edge debounce.
 */
export class ProfileWatcher {
  private watcher: FSWatcher | null = null;
  private readonly timers = new Map<FileGroup, NodeJS.Timeout>();
  private readonly debounceMs: number;

  constructor(private readonly opts: ProfileWatcherOptions) {
    this.debounceMs = opts.debounceMs ?? 250;
  }

  start(): void {
    const path = this.findProfileDir();
    if (!path) {
      logger.warn({ event: 'profile_watcher_no_dir' }, 'no profile/ directory found, watcher idle');
      return;
    }
    if (this.watcher) return;
    this.watcher = watch(path, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const group = classify(filename);
      if (group === 'ignored') return;
      this.schedule(group);
    });
    logger.info({ event: 'profile_watcher_started', path }, 'profile watcher started');
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
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

  private findProfileDir(): string | null {
    for (const candidate of PROFILE_CANDIDATES) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }
}

/**
 * Map a filename (relative to profile/) to its reload group.
 * Anything under skills/ is ignored — Zeno reads those on-demand via Read tool.
 */
function classify(filename: string): FileGroup {
  const normalized = filename.replace(/\\/g, '/');
  if (normalized.startsWith('skills/') || normalized === 'skills') return 'ignored';
  if (normalized === 'SOUL.md' || normalized === 'USER.md') return 'prompt';
  if (normalized === 'crons.yaml') return 'crons';
  if (normalized === 'mcp.json') return 'mcp';
  return 'ignored';
}
