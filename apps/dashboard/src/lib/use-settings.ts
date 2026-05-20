import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface SettingsSnapshot {
  backend: { name: string; selectedVia: string };
  // Spec 2026-05-20 (agents-md-per-instance): optional operator name
  // parsed from AGENTS.md (YAML frontmatter or body `Name: <value>`),
  // plus profile slug from ZENO_PROFILE env. `name` falls back to null
  // when AGENTS.md has no `name:` field (the common case — AGENTS.md is
  // an operating manual, not a bio); the sidebar renders the slug then.
  profile: { name: string | null; slug: string };
  profileFiles: Array<{ path: string; bytes: number; mtime: string }>;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<SettingsSnapshot>('/api/settings'),
  });
}
