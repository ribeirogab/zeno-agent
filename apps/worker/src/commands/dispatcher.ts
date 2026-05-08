import type { Command } from '@zeno/db/runtime';

export type HandlerResult = { ok: true; data?: unknown } | { ok: false; error: string };

export type Handler = (cmd: Command) => Promise<HandlerResult>;

export type HandlerMap = Record<Command['type'], Handler>;

export function buildDispatcher(handlers: HandlerMap): (cmd: Command) => Promise<HandlerResult> {
  return async (cmd) => {
    const h = handlers[cmd.type];
    if (!h) return { ok: false, error: `unknown command type: ${cmd.type}` };
    return h(cmd);
  };
}
