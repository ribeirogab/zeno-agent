import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY_STATE, DEFAULT_FILTER_STATE } from './types';
import { useGraphDisplay, useGraphFilters } from './use-graph-state';

const FILTERS_KEY = 'zeno.knowledge.graph.filters';
const DISPLAY_KEY = 'zeno.knowledge.graph.display';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  window.localStorage.clear();
});

describe('useGraphFilters', () => {
  it('returns defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useGraphFilters());
    expect(result.current[0]).toEqual(DEFAULT_FILTER_STATE);
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useGraphFilters());
    act(() => {
      result.current[1]({ ...DEFAULT_FILTER_STATE, search: 'foo' });
    });
    expect(JSON.parse(window.localStorage.getItem(FILTERS_KEY) ?? '{}').search).toBe('foo');
  });

  it('restores from localStorage on mount', () => {
    window.localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ ...DEFAULT_FILTER_STATE, search: 'bar' }),
    );
    const { result } = renderHook(() => useGraphFilters());
    expect(result.current[0].search).toBe('bar');
  });

  it('falls back to defaults on malformed JSON', () => {
    window.localStorage.setItem(FILTERS_KEY, '{not-json');
    const { result } = renderHook(() => useGraphFilters());
    expect(result.current[0]).toEqual(DEFAULT_FILTER_STATE);
  });
});

describe('useGraphDisplay', () => {
  it('returns defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useGraphDisplay());
    expect(result.current[0]).toEqual(DEFAULT_DISPLAY_STATE);
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useGraphDisplay());
    act(() => {
      result.current[1]({ ...DEFAULT_DISPLAY_STATE, nodeSize: 1.5 });
    });
    expect(JSON.parse(window.localStorage.getItem(DISPLAY_KEY) ?? '{}').nodeSize).toBe(1.5);
  });
});
