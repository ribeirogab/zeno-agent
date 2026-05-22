import type { Command } from '@zeno/db/runtime';

export type HandlerResult = { ok: true; data?: unknown } | { ok: false; error: string };

export type Handler = (cmd: Command) => Promise<HandlerResult>;

// Spec 2026-05-22 (crons CLI-first): some command types are retired but kept
// in the union for historical row compatibility. Handlers may legitimately
// omit them — the dispatcher returns `skipped` for any type without a handler.
export type HandlerMap = Partial<Record<Command['type'], Handler>>;

export function buildDispatcher(handlers: HandlerMap): (cmd: Command) => Promise<HandlerResult> {
  return async (cmd) => {
    const h = handlers[cmd.type];
    if (!h) return { ok: false, error: `unknown command type: ${cmd.type}` };
    return h(cmd);
  };
}
