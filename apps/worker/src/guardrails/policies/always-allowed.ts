import type { PolicyMiddleware } from '../types.js';

interface AlwaysAllowedOptions {
  tools: string[];
  commands: string[];
}

function matchesToolPattern(toolName: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return toolName.startsWith(pattern.slice(0, -1));
  }
  return toolName === pattern;
}

function commandContainsPattern(command: string, pattern: string): boolean {
  if (!pattern.includes('*')) return command.includes(pattern);
  const parts = pattern.split('*').filter((p) => p !== '');
  let pos = 0;
  for (const part of parts) {
    const idx = command.indexOf(part, pos);
    if (idx === -1) return false;
    pos = idx + part.length;
  }
  return true;
}

export function makeAlwaysAllowedPolicy(opts: AlwaysAllowedOptions): PolicyMiddleware {
  return {
    name: 'always_allowed',
    async check(ctx) {
      if (opts.tools.some((pattern) => matchesToolPattern(ctx.toolName, pattern))) {
        return { allow: true, reason: 'tool in always_allowed_tools', policyThatGated: 'auto_allow' };
      }

      if (ctx.toolName === 'Bash' && opts.commands.length > 0) {
        const command = (ctx.toolInput as Record<string, unknown>).command;
        if (typeof command === 'string') {
          if (opts.commands.some((pattern) => commandContainsPattern(command, pattern))) {
            return {
              allow: true,
              reason: 'command matches always_allowed pattern',
              policyThatGated: 'auto_allow',
            };
          }
        }
      }

      return undefined;
    },
  };
}
