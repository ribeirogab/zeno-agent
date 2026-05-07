---
tags:
  - learning
  - reference
related:
  - "[[../specs/2026-05-07-zeno-cli/spec|Zeno CLI spec]]"
created: 2026-05-07
---
# citty CLI gotchas (0.2.x)

`citty` (used by zeno-agent's CLI) has two non-obvious behaviors that affected the design.

## Context

Discovered while wiring up `apps/cli` (spec `2026-05-07-zeno-cli`). Both surfaced during manual smoke-testing of `zeno --profile <name> <subcommand>` and the `zeno docker <args...>` passthrough.

1. **Subcommand-flag ordering is strict.** `zeno --profile nonexistent status` is parsed as `zeno <positional:nonexistent> status` and exits with `Unknown command nonexistent`. The flag must come *after* the subcommand: `zeno status --profile nonexistent`. citty does not propagate root-level args to subcommands as global flags; each subcommand declares its own `args.profile`.

2. **No native positional varargs.** A subcommand cannot declare `args._: { type: 'positional', ... }` to capture an arbitrary tail of arguments. The escape hatch is the `rawArgs` parameter in the `run({ args, rawArgs })` handler, which contains the original arg array; the subcommand has to strip its own known flags (`--profile <val>`, `--profile=<val>`) and forward the rest. See `apps/cli/src/commands/docker.ts` for the implementation.

## How to Apply

- Document the flag-after-subcommand pattern in `--help` output and in the README's "Daily ops" section. The user notices the parse failure only at runtime.
- For any future passthrough command in citty, use `rawArgs` + a small `stripOwnFlags` helper. Keep that helper colocated with the command module rather than promoting it to a shared utility — every passthrough has slightly different flags to strip.
- If citty introduces native global flags or positional varargs in a future release, revisit `docker.ts` and the per-command `args.profile` duplication; both can collapse into one root-level declaration.
