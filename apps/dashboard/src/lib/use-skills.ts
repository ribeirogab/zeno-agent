import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { cacheChange, useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export interface SkillListItem {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillDetail extends SkillListItem {
  body: string;
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

/** POST /api/skills with raw .md content. Returns the created Skill on 201. */
export function useInstallSkill() {
  return useOptimisticMutation<{ content: string }, SkillDetail>({
    mutationFn: ({ content }) =>
      apiFetch<SkillDetail>('/api/skills', {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    invalidateKeys: () => [['skills']],
    successToast: (s) => `${s.name} installed`,
  });
}

/** PATCH /api/skills/:id with raw .md content. Body update; name immutable. */
export function useEditSkill() {
  return useOptimisticMutation<{ id: string; content: string }, SkillDetail>({
    mutationFn: ({ id, content }) =>
      apiFetch<SkillDetail>(`/api/skills/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    invalidateKeys: ({ id }) => [['skills'], ['skills', id]],
    successToast: (s) => `${s.name} updated`,
  });
}

/** DELETE /api/skills/:id. Cascades to connector_skills FK on the backend. */
export function useDeleteSkill() {
  return useOptimisticMutation<{ id: string; name: string }, void>({
    mutationFn: ({ id }) => apiFetch<void>(`/api/skills/${id}`, { method: 'DELETE' }),
    optimisticUpdate: ({ id }) => [
      cacheChange<SkillListItem[]>(['skills'], (prev) => prev?.filter((s) => s.id !== id)),
    ],
    invalidateKeys: ({ id }) => [['skills'], ['skills', id]],
    successToast: (_result, { name }) => `${name} deleted`,
  });
}
