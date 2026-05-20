import { existsSync, type FSWatcher, watch } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

/** Logical groupings of identity/config files. The watcher dispatches one group per debounce window. */
type FileGroup = 'prompt' | 'skills' | 'ignored';

type SourceKind = 'agent' | 'profile' | 'skills';

const AGENT_CANDIDATES = ['/app/agent', 'agent'];
const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

interface ProfileWatcherOptions {
  /** Called when SOUL.md (agent/) or AGENTS.md (profile/) changes. */
  onPromptFilesChanged: () => void;
  /** Spec 0052/0062: called when any skill content changes (SSH-edits in agent/profile/dashboard skills, dashboard zip uploads, etc.). */
  onSkillsChanged?: () => void;
  /**
   * Spec 0062: absolute path to `/workspace/skills/` (the dashboard upload
   * volume). When provided, the watcher monitors it as a third source
   * and dispatches `skills` events. When undefined, only edits under
   * `agent/skills/` and `profile/skills/` fire 'skills' events (via
   * the classify-by-prefix rules below).
   *
   * NOTE: this REPLACES the spec-0052 `skillsPath` parameter (which used
   * to point at `${claudeHome}/skills/`). Watching the materialized symlink
   * farm produces redundant events because every dashboard write or SSH
   * edit fires both at the canonical path AND at the symlink. After
   * spec 0062 we watch only the canonical paths.
   */
  dashboardSkillsPath?: string;
  /** Debounce window in ms. Defaults to 250 — enough to coalesce editor save bursts. */
  debounceMs?: number;
}

/**
 * Watches agent/, profile/, and (spec 0062) /workspace/skills/ for
 * hot-reloadable changes. Native fs.watch (recursive) — no extra deps.
 * Editor saves emit 5+ events; we coalesce per group with a trailing-edge
 * debounce.
 */
export class ProfileWatcher {
  private readonly watchers: FSWatcher[] = [];
  private readonly timers = new Map<FileGroup, NodeJS.Timeout>();
  private readonly debounceMs: number;
  /** Map of source label → absolute root path. Used by the macOS fallback to derive relative filename when fs.watch returns null/absolute. */
  private readonly rootBySource = new Map<SourceKind, string>();

  constructor(private readonly opts: ProfileWatcherOptions) {
    this.debounceMs = opts.debounceMs ?? 250;
  }

  start(): void {
    if (this.watchers.length > 0) return;

    const agentPath = findSourceDir(AGENT_CANDIDATES);
    if (agentPath) {
      this.rootBySource.set('agent', agentPath);
      this.watchers.push(this.openWatcher('agent', agentPath));
      logger.info({ event: 'profile_watcher_started', source: 'agent', path: agentPath });
    } else {
      logger.warn({ event: 'profile_watcher_no_dir', source: 'agent' });
    }

    const profilePath = findSourceDir(PROFILE_CANDIDATES);
    if (profilePath) {
      this.rootBySource.set('profile', profilePath);
      this.watchers.push(this.openWatcher('profile', profilePath));
      logger.info({ event: 'profile_watcher_started', source: 'profile', path: profilePath });
    } else {
      logger.warn({ event: 'profile_watcher_no_dir', source: 'profile' });
    }

    // Spec 0062: skills bucket watches /workspace/skills/. Only when
    // both the path is configured and onSkillsChanged is provided.
    if (
      this.opts.dashboardSkillsPath &&
      this.opts.onSkillsChanged &&
      existsSync(this.opts.dashboardSkillsPath)
    ) {
      this.rootBySource.set('skills', this.opts.dashboardSkillsPath);
      this.watchers.push(this.openWatcher('skills', this.opts.dashboardSkillsPath));
      logger.info({
        event: 'profile_watcher_started',
        source: 'skills',
        path: this.opts.dashboardSkillsPath,
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
      // macOS FSEvents fallback: if fs.watch delivers null or an absolute
      // path instead of the expected root-relative path, derive the
      // relative path ourselves.
      const normalizedFilename = this.normalizeFilename(filename, source);
      if (normalizedFilename === null) return;

      const group = classify(source, normalizedFilename);
      if (group === 'ignored') return;
      this.schedule(group);
    });
  }

  /**
   * Spec 0062: normalize the filename delivered by fs.watch into a
   * root-relative path. On Linux/inotify this is already relative
   * (`skills/foo/SKILL.md`); on macOS/FSEvents we sometimes get null or
   * an absolute path. The fallback resolves against the watched root
   * stored in `rootBySource`.
   */
  private normalizeFilename(filename: string | null, source: SourceKind): string | null {
    if (filename === null) return null;
    if (!isAbsolute(filename)) return filename;
    const root = this.rootBySource.get(source);
    if (!root) return filename; // fallback: hand the absolute path through; classify will reject
    const rel = relative(root, filename);
    if (rel.startsWith('..')) return null; // outside the root, ignore
    return rel;
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
 *
 * Spec 0062 — classify recognizes skill events from THREE buckets:
 * - any change under the `skills` source root (= `/workspace/skills/`,
 *   the dashboard volume)
 * - any change in `agent/skills/<name>/...` (SSH-drop or rebuild-image swap)
 * - any change in `profile/skills/<name>/...` (host edit of profile dirs)
 * The ProfileWatcher's debounced 'skills' bucket fires the materializer +
 * frontmatter resync.
 */
export function classify(source: SourceKind, filename: string): FileGroup {
  const normalized = filename.replace(/\\/g, '/');
  if (source === 'agent' && normalized === 'SOUL.md') return 'prompt';
  if (source === 'profile' && normalized === 'AGENTS.md') return 'prompt';
  if (source === 'skills') return 'skills';
  // Spec 0062: edits to agent/skills/* and profile/skills/* fire skills events.
  if (source === 'agent' && normalized.startsWith('skills/')) return 'skills';
  if (source === 'profile' && normalized.startsWith('skills/')) return 'skills';
  return 'ignored';
}
