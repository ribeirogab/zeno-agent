/**
 * Spec 0071: thin EventSource wrapper for the auto-OAuth flow.
 *
 * The hook owns one EventSource at a time. On `start({ backendId, sessionId })`
 * it opens the SSE stream and pushes events into local React state. The
 * component re-renders per event and renders the appropriate Configure modal
 * variant per the state machine in spec.
 *
 * `cancel()` closes the EventSource and POSTs to /cancel. On unmount the
 * effect cleanup also closes any open EventSource.
 *
 * The SSE stream NEVER carries the token value — the server-side handler runs
 * the verification handshake and persists; the client only sees state events.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { csrfHeaders } from '@/lib/api-client';

export type OAuthFlowState =
  | { kind: 'idle' }
  | { kind: 'waiting'; deviceCodeUrl: string | null }
  /** CLI is now waiting for the operator to paste the OAuth callback code. */
  | {
      kind: 'awaiting_code';
      deviceCodeUrl: string | null;
      submitting: boolean;
      error: string | null;
    }
  | { kind: 'verifying' }
  | { kind: 'done' }
  | {
      kind: 'error';
      errorKind: 'cli' | 'unauthorized' | 'rate_limited' | 'network';
      message: string;
      retryAfterSec?: number;
    };

interface SseEvent {
  type:
    | 'device_code_url'
    | 'awaiting_code'
    | 'status'
    | 'token_captured'
    | 'verifying'
    | 'success'
    | 'error';
  url?: string;
  text?: string;
  kind?: 'cli' | 'unauthorized' | 'rate_limited' | 'network';
  message?: string;
  retryAfterSec?: number;
}

export function useOAuthSession() {
  const [state, setState] = useState<OAuthFlowState>({ kind: 'idle' });
  const sourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const closeStream = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const start = useCallback(
    (opts: { backendId: string; sessionId: string }) => {
      closeStream();
      sessionIdRef.current = opts.sessionId;
      setState({ kind: 'waiting', deviceCodeUrl: null });
      const url = `/api/backends/${opts.backendId}/oauth/${opts.sessionId}/stream`;
      const es = new EventSource(url, { withCredentials: true });
      sourceRef.current = es;
      es.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data) as SseEvent;
          if (ev.type === 'device_code_url' && ev.url) {
            setState((prev) => {
              if (prev.kind === 'awaiting_code') return { ...prev, deviceCodeUrl: ev.url ?? null };
              return { kind: 'waiting', deviceCodeUrl: ev.url ?? null };
            });
          } else if (ev.type === 'awaiting_code') {
            setState((prev) => ({
              kind: 'awaiting_code',
              deviceCodeUrl:
                prev.kind === 'waiting' || prev.kind === 'awaiting_code'
                  ? prev.deviceCodeUrl
                  : null,
              submitting: false,
              error: null,
            }));
          } else if (ev.type === 'verifying') {
            setState({ kind: 'verifying' });
          } else if (ev.type === 'success') {
            setState({ kind: 'done' });
            closeStream();
          } else if (ev.type === 'error') {
            setState({
              kind: 'error',
              errorKind: ev.kind ?? 'cli',
              message: ev.message ?? 'unknown error',
              ...(ev.retryAfterSec !== undefined ? { retryAfterSec: ev.retryAfterSec } : {}),
            });
            closeStream();
          }
        } catch {
          // ignore malformed event
        }
      };
      es.onerror = () => {
        // EventSource fires onerror on close after server EOF — only treat as
        // an error state when we're still in flight (waiting/verifying).
        setState((prev) =>
          prev.kind === 'waiting' || prev.kind === 'verifying'
            ? { kind: 'error', errorKind: 'network', message: 'SSE stream closed unexpectedly' }
            : prev,
        );
        closeStream();
      };
    },
    [closeStream],
  );

  const cancel = useCallback(
    (backendId: string) => {
      const sid = sessionIdRef.current;
      closeStream();
      setState({ kind: 'idle' });
      if (sid) {
        // fire-and-forget — the registry's GC handles dangling sessions
        void fetch(`/api/backends/${backendId}/oauth/${sid}/cancel`, {
          method: 'POST',
          credentials: 'include',
          headers: { ...csrfHeaders('POST') },
        });
      }
    },
    [closeStream],
  );

  const reset = useCallback(() => {
    closeStream();
    setState({ kind: 'idle' });
  }, [closeStream]);

  /**
   * Submit the OAuth callback `code` the operator pasted. Forwards to the
   * `/oauth/:session/input` endpoint which writes to the CLI's stdin. The CLI
   * then exchanges code → token; the SSE stream picks up the token automatically.
   */
  const submitCode = useCallback(async (backendId: string, code: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    setState((prev) =>
      prev.kind === 'awaiting_code' ? { ...prev, submitting: true, error: null } : prev,
    );
    try {
      const res = await fetch(`/api/backends/${backendId}/oauth/${sid}/input`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', ...csrfHeaders('POST') },
        body: JSON.stringify({ text: code }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setState((prev) =>
        prev.kind === 'awaiting_code'
          ? { ...prev, submitting: false, error: err instanceof Error ? err.message : 'failed' }
          : prev,
      );
    }
    // Don't reset submitting here — let the SSE token_captured/error event drive the next state.
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return closeStream;
  }, [closeStream]);

  return { state, start, cancel, reset, submitCode };
}
