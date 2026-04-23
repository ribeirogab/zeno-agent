import type { PolicyMiddleware } from '../types.js';

interface AlwaysAllowedOptions {
  tools: string[];
  commands: string[];
}

function matchesPattern(value: string, pattern: string): boolean {
  if (!pattern.includes('*')) return value === pattern;
  const parts = pattern.split('*');
  let pos = 0;
  for (const part of parts) {
    if (part === '') continue;
    const idx = value.indexOf(part, pos);
    if (idx === -1) return false;
    pos = idx + part.length;
  }
  if (!pattern.endsWith('*') && pos !== value.length) return false;
  if (!pattern.startsWith('*') && !value.startsWith(parts[0] ?? '')) return false;
  return true;
}

export function makeAlwaysAllowedPolicy(opts: AlwaysAllowedOptions): PolicyMiddleware {
  return {
    name: 'always_allowed',
    async check(ctx) {
      if (opts.tools.some((pattern) => matchesPattern(ctx.toolName, pattern))) {
        return { allow: true, reason: 'tool in always_allowed_tools', policyThatGated: 'auto_allow' };
      }

      if (ctx.toolName === 'Bash' && opts.commands.length > 0) {
        const command = (ctx.toolInput as Record<string, unknown>).command;
        if (typeof command === 'string') {
          if (opts.commands.some((pattern) => matchesPattern(command, pattern))) {
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
