import { useEffect, useState } from 'react';
import {
  DEFAULT_DISPLAY_STATE,
  DEFAULT_FILTER_STATE,
  type DisplayState,
  type FilterState,
} from './types';

const FILTERS_KEY = 'zeno.knowledge.graph.filters';
const DISPLAY_KEY = 'zeno.knowledge.graph.display';

function readLocal<T extends object>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return fallback;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or other write failure — keep in-memory state only.
  }
}

export function useGraphFilters(): [FilterState, (next: FilterState) => void] {
  const [state, setState] = useState<FilterState>(() =>
    readLocal(FILTERS_KEY, DEFAULT_FILTER_STATE),
  );
  useEffect(() => {
    writeLocal(FILTERS_KEY, state);
  }, [state]);
  return [state, setState];
}

export function useGraphDisplay(): [DisplayState, (next: DisplayState) => void] {
  const [state, setState] = useState<DisplayState>(() =>
    readLocal(DISPLAY_KEY, DEFAULT_DISPLAY_STATE),
  );
  useEffect(() => {
    writeLocal(DISPLAY_KEY, state);
  }, [state]);
  return [state, setState];
}
