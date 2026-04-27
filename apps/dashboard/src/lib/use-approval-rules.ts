/**
 * Approval rules CRUD hooks. Spec 0047.
 *
 * - useApprovalRules: list query
 * - useCreateApprovalRule: manual rule add (optimistic)
 * - useDeleteApprovalRule: delete (optimistic; rejects 403 for auto rules)
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { cacheChange, useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export type ApprovalRuleSource = 'manual' | 'auto' | 'yaml-migrated';

export interface ApprovalRule {
  id: string;
  pattern: string;
  source: ApprovalRuleSource;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
}

// Spec 0048 Q6: enriched shape returned from `?include=match-status`.
export interface ApprovalRuleWithMatchStatus extends ApprovalRule {
  matchStatus: {
    matchCount: number;
    isOrphan: boolean;
  };
}

const KEY = ['approval-rules'] as const;

export function useApprovalRules() {
  return useQuery({
    queryKey: KEY,
    queryFn: () =>
      apiFetch<ApprovalRuleWithMatchStatus[]>('/api/approval-rules?include=match-status'),
  });
}

// Spec 0048 Q6: mass-remove orphan rules.
export function useRemoveOrphanRules() {
  return useOptimisticMutation<void, { deletedCount: number }>({
    mutationFn: () =>
      apiFetch<{ deletedCount: number }>('/api/approval-rules/remove-orphans', {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      }),
    invalidateKeys: () => [['approval-rules']],
    successToast: (result) =>
      `${result.deletedCount} orphan rule${result.deletedCount === 1 ? '' : 's'} removed`,
  });
}

export interface CreateRuleInput {
  pattern: string;
  notes?: string;
}

export function useCreateApprovalRule() {
  return useOptimisticMutation<CreateRuleInput, ApprovalRule>({
    mutationFn: (input) =>
      apiFetch<ApprovalRule>('/api/approval-rules', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    invalidateKeys: () => [['approval-rules']],
    successToast: (_, vars) => `rule "${vars.pattern}" added`,
  });
}

export function useDeleteApprovalRule() {
  return useOptimisticMutation<string, { ok: true }>({
    mutationFn: (id) => apiFetch<{ ok: true }>(`/api/approval-rules/${id}`, { method: 'DELETE' }),
    optimisticUpdate: (id) => [
      cacheChange<ApprovalRule[]>(['approval-rules'], (prev) => {
        if (!prev) return prev;
        return prev.filter((r) => r.id !== id);
      }),
    ],
    invalidateKeys: () => [['approval-rules']],
    successToast: 'rule deleted',
  });
}
