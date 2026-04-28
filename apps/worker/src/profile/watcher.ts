import { existsSync, type FSWatcher, watch } from 'node:fs';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

/** Logical groupings of identity/config files. The watcher dispatches one group per debounce window. */
type FileGroup = 'prompt' | 'crons' | 'skills' | 'ignored';

type SourceKind = 'agent' | 'profile' | 'skills';

const AGENT_CANDIDATES = ['/app/agent', 'agent'];
const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

interface ProfileWatcherOptions {
  /** Called when SOUL.md (agent/) or USER.md (profile/) changes. */
  onPromptFilesChanged: () => void;
  /** Called when profile/config.yaml changes. */
  onCronsChanged: () => void;
  /** Spec 0052: called when ${claudeHome}/skills/<n>/SKILL.md changes. */
  onSkillsChanged?: () => void;
  /**
   * Spec 0052: absolute path to ${claudeHome}/skills. When provided, the
   * watcher monitors it as a third source and dispatches `skills` events.
   * When undefined, skill changes are not watched (e.g., test contexts).
   */
  skillsPath?: string;
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

    // Spec 0052: skills bucket watches ${claudeHome}/skills/. Only when
    // both the path is configured and onSkillsChanged is provided.
    if (this.opts.skillsPath && this.opts.onSkillsChanged && existsSync(this.opts.skillsPath)) {
      this.watchers.push(this.openWatcher('skills', this.opts.skillsPath));
      logger.info({
        event: 'profile_watcher_started',
        source: 'skills',
        path: this.opts.skillsPath,
      });
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
        case 'skills':
          this.opts.onSkillsChanged?.();
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
 * `mcp.json` is ignored after spec 0032 (DB is the source of truth for MCPs).
 * Spec 0052: any change in the `skills` source bucket maps to 'skills'
 * (e.g. `${claudeHome}/skills/<n>/SKILL.md`).
 */
export function classify(source: SourceKind, filename: string): FileGroup {
  const normalized = filename.replace(/\\/g, '/');
  if (source === 'agent' && normalized === 'SOUL.md') return 'prompt';
  if (source === 'profile' && normalized === 'USER.md') return 'prompt';
  if (source === 'profile' && normalized === 'config.yaml') return 'crons';
  if (source === 'skills') return 'skills';
  return 'ignored';
}
