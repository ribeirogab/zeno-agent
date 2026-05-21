import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface KnowledgeFileSummary {
  path: string;
  title: string;
  bytes: number;
  mtime: string;
  tags: string[];
}

export interface KnowledgeFilesResponse {
  files: KnowledgeFileSummary[];
  totalBytes: number;
  totalFiles: number;
}

export interface KnowledgeFileResponse {
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  title: string;
  bytes: number;
  mtime: string;
  wikilinks: Record<string, string | null>;
}

export function useKnowledgeFiles() {
  return useQuery({
    queryKey: ['knowledge', 'files'],
    queryFn: () => apiFetch<KnowledgeFilesResponse>('/api/knowledge/files'),
    staleTime: 30_000,
  });
}

export function useKnowledgeFile(path: string | undefined) {
  return useQuery({
    queryKey: ['knowledge', 'file', path ?? null],
    queryFn: () =>
      apiFetch<KnowledgeFileResponse>(`/api/knowledge/file?path=${encodeURIComponent(path ?? '')}`),
    enabled: typeof path === 'string' && path.length > 0,
    staleTime: 0,
  });
}
