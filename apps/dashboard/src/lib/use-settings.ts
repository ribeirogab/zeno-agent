import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface SettingsSnapshot {
  backend: { name: string; selectedVia: string };
  // Spec 0066 A: parsed identity from USER.md frontmatter + ZENO_PROFILE
  // env var. `name` falls back to null when frontmatter is missing or
  // has no `name:` key — the sidebar renders the slug in that case.
  profile: { name: string | null; slug: string };
  profileFiles: Array<{ path: string; bytes: number; mtime: string }>;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<SettingsSnapshot>('/api/settings'),
  });
}
