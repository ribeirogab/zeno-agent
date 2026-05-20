---
tags:
  - learning
related:
  - "[[../specs/2026-05-19-connector-mysql/spec-connector-mysql|connector-mysql spec]]"
created: 2026-05-19
---
# citty 0.1.6 clobbers repeated string-typed flags

`citty@0.1.6` (pinned as a transitive in our CLI workspace) does NOT support array-typed args. When the operator passes a `type: 'string'` flag multiple times (e.g. `--secret K1=v1 --secret K2=v2 --secret K3=v3`), citty silently keeps only the LAST occurrence — every earlier flag is dropped before reaching the command's `run()` handler. The TypeScript declaration confirms this: `ArgType = "boolean" | "string" | "positional"` — no `string[]` and no `multiple` option.

## Context

Discovered while smoke-testing the MySQL connector (issue #81, PR #82). MySQL is the first catalog connector with five required secrets; postgres / linear / sentry / klaviyo / swarmia / github-PAT all declare exactly one required secret today, so the bug was latent. The CLI install path had defensive `Array.isArray(flag)` handling in `parseSecretFlags`, but citty never produced the array — the array branch was dead code. Symptom in the wild: `zeno connector install mysql --label "smoke" --secret MYSQL_HOST=… --secret MYSQL_PORT=… --secret MYSQL_USER=… --secret MYSQL_PASS=… --secret MYSQL_DB=…` exited with `secret value required but stdin is not a TTY` because four of the five `--secret` flags vanished and `promptHidden` was invoked in a non-interactive context.

## How to Apply

When a citty-driven CLI command needs to accept a flag MULTIPLE times, do not rely on citty to collect the values into an array. Instead, accept the citty-parsed value as a fallback and scan `context.rawArgs` yourself to recover every occurrence:

```ts
async run({ args, rawArgs }) {
  const items = collectFlag('--secret', rawArgs);
  // items is now Array<string> covering every --secret KEY=VAL the operator typed
}

function collectFlag(name: string, rawArgs: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === name) {
      const next = rawArgs[i + 1];
      if (typeof next === 'string' && !next.startsWith('-')) {
        out.push(next);
        i++;
      }
    } else if (arg.startsWith(`${name}=`)) {
      out.push(arg.slice(name.length + 1));
    }
  }
  return out;
}
```

Apply this pattern to ANY future multi-occurrence CLI flag (e.g., `--label`, `--tag`, `--include`). The fix landed in `apps/cli/src/commands/connector-install.ts::parseSecretFlags`. A future citty upgrade to a version that supports array-typed args would let us drop the workaround, but until that happens, rely on `rawArgs`.

The same caveat affects `channel-install.ts:46`, `channel-rotate.ts:44`, and any other command that currently passes `args.secret` through to a similar parser without consulting `rawArgs`. Those commands work today because they're only exercised with a single `--secret` flag, but they would break the moment a multi-secret channel ships.
