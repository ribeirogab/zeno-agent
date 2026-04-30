import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@zeno/ui';
import { apiFetch } from '@/lib/api-client';
import { useOptimisticMutation } from '@/lib/use-optimistic-mutation';

/** Spec 0053: skills are tagged by origin so the dashboard can hide edit/delete on
 * `zeno_default` rows and show a "managed by Zeno" badge instead. */
export type SkillSource = 'zeno_default' | 'profile' | 'dashboard';

export interface SkillListItem {
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  createdAt: string;
  updatedAt: string;
}

/**
 * Spec 0062: skill detail no longer carries `body`. Bytes live on disk.
 * The detail response includes aggregate counts for the delete cascade
 * modal — connectorSkillsCount + cronSkillsCount.
 */
export interface SkillDetail extends SkillListItem {
  connectorSkillsCount: number;
  cronSkillsCount: number;
}

/** Spec 0062: per-file file tree entry. */
export interface SkillFileEntry {
  path: string;
  sizeBytes: number;
  mimeType: string;
}

export function useSkills() {
  return useQuery({
    queryKey: ['skills'],
    queryFn: () => apiFetch<SkillListItem[]>('/api/skills'),
  });
}

export function useSkill(id: string | undefined) {
  return useQuery({
    queryKey: ['skills', id],
    queryFn: () => apiFetch<SkillDetail>(`/api/skills/${id}`),
    enabled: Boolean(id),
  });
}

/** Spec 0062: file tree query. Cached separately from the skill detail. */
export function useSkillFiles(id: string | undefined) {
  return useQuery({
    queryKey: ['skills', id, 'files'],
    queryFn: () => apiFetch<SkillFileEntry[]>(`/api/skills/${id}/files`),
    enabled: Boolean(id),
  });
}

/** Spec 0062: read individual file content. */
export function useSkillFile(id: string | undefined, path: string | undefined) {
  return useQuery({
    queryKey: ['skills', id, 'files', path],
    queryFn: async () => {
      if (!id || !path) throw new Error('id + path required');
      const res = await fetch(`/api/skills/${id}/files/${encodeURIComponent(path)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    enabled: Boolean(id) && Boolean(path),
  });
}

/** Spec 0062: POST /api/skills with multipart zip. Returns the created Skill on 201. */
export function useInstallSkillZip() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<SkillDetail, Error, { zip: Blob; filename: string }>({
    mutationFn: async ({ zip, filename }) => {
      const fd = new FormData();
      fd.append('file', zip, filename);
      const res = await fetch('/api/skills', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.message ?? `HTTP ${res.status}`) as Error & {
          code?: string;
          status?: number;
        };
        err.code = body.error;
        err.status = res.status;
        throw err;
      }
      return (await res.json()) as SkillDetail;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      toast.success(`${s.name} installed`);
    },
  });
}

/** Spec 0062: PUT /api/skills/:id/files/:path — overwrite a single file. */
export function useWriteSkillFile() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<void, Error, { id: string; path: string; content: string }>({
    mutationFn: async ({ id, path, content }) => {
      const res = await fetch(`/api/skills/${id}/files/${encodeURIComponent(path)}`, {
        method: 'PUT',
        body: content,
        credentials: 'include',
        headers: { 'Content-Type': 'text/plain' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: (_, { id, path }) => {
      qc.invalidateQueries({ queryKey: ['skills', id, 'files'] });
      qc.invalidateQueries({ queryKey: ['skills', id, 'files', path] });
      if (path === 'SKILL.md') {
        qc.invalidateQueries({ queryKey: ['skills', id] });
      }
      toast.success(`${path} saved`);
    },
  });
}

/** Spec 0062: DELETE /api/skills/:id/files/:path — remove single file. */
export function useDeleteSkillFile() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<void, Error, { id: string; path: string }>({
    mutationFn: async ({ id, path }) => {
      const res = await fetch(`/api/skills/${id}/files/${encodeURIComponent(path)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
    },
    onSuccess: (_, { id, path }) => {
      qc.invalidateQueries({ queryKey: ['skills', id, 'files'] });
      toast.success(`${path} removed`);
    },
  });
}

/** Spec 0062: PATCH /api/skills/:id — description-only. */
export function useEditSkillDescription() {
  return useOptimisticMutation<{ id: string; description: string }, SkillDetail>({
    mutationFn: ({ id, description }) =>
      apiFetch<SkillDetail>(`/api/skills/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ description }),
      }),
    invalidateKeys: ({ id }) => [['skills'], ['skills', id]],
    successToast: (s) => `${s.name} updated`,
  });
}

/** DELETE /api/skills/:id. Spec 0062: cascades to FS dir for dashboard source. */
export function useDeleteSkill() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<void, Error, { id: string; name: string }>({
    mutationFn: ({ id }) => apiFetch<void>(`/api/skills/${id}`, { method: 'DELETE' }),
    onSuccess: (_, { id, name }) => {
      qc.removeQueries({ queryKey: ['skills', id] });
      qc.removeQueries({ queryKey: ['skills', id, 'files'] });
      qc.invalidateQueries({ queryKey: ['skills'] });
      toast.success(`${name} deleted`);
    },
  });
}
