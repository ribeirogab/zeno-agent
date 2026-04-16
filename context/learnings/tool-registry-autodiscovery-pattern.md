---
tags:
  - learning
  - concept
related:
  - "[[hermes-architecture]]"
  - "[[lessons-for-zeno-from-openclaw-hermes]]"
created: 2026-04-15
---
# Tool registry with import-time auto-discovery

Hermes Agent's extension pattern: a single-file tool = a module that calls `registry.register(...)` at import time; a parent module imports the directory; every file that self-registers is automatically available. Zero manual wiring per tool. This is the cleanest "how do I add a tool" story of any agent framework studied.

## Context

Discovered during 2026-04-15 competitive analysis. Hermes uses it for 40+ built-in tools; user plugins in `~/.hermes/plugins/` follow the same protocol — drop a Python file, it's live.

## How to Apply

**The pattern (Python, Hermes):**

`tools/registry.py` — the only module others depend on:
```python
class ToolRegistry:
    def __init__(self):
        self._tools = {}

    def register(self, name, toolset, schema, handler, check_fn=None, requires_env=None):
        self._tools[name] = {
            'toolset': toolset, 'schema': schema, 'handler': handler,
            'check_fn': check_fn, 'requires_env': requires_env or []
        }

    def get_schemas(self, enabled_toolsets):
        return [t['schema'] for t in self._tools.values()
                if t['toolset'] in enabled_toolsets and (t['check_fn'] is None or t['check_fn']())]

    def dispatch(self, name, args, **kwargs):
        tool = self._tools[name]
        return tool['handler'](args, **kwargs)

registry = ToolRegistry()  # singleton
```

`tools/example_tool.py` — one file, one tool, self-registering:
```python
import os, json
from tools.registry import registry

def check_requirements(): return bool(os.getenv("EXAMPLE_API_KEY"))

def example_tool(param, task_id=None):
    return json.dumps({"success": True, "data": "..."})

registry.register(
    name="example_tool",
    toolset="example",
    schema={"name": "example_tool", "description": "...", "parameters": {...}},
    handler=lambda args, **kw: example_tool(param=args.get("param", ""), task_id=kw.get("task_id")),
    check_fn=check_requirements,
    requires_env=["EXAMPLE_API_KEY"],
)
```

`model_tools.py` — imports the directory once, triggers every `registry.register` call:
```python
import importlib, pkgutil, tools
for _, modname, _ in pkgutil.iter_modules(tools.__path__):
    importlib.import_module(f"tools.{modname}")
# Now registry is populated.
```

**Why this is elegant:**
1. **Zero ceremony** to add a tool — no manifest, no `tools/__init__.py` edit, no map table.
2. **Opt-in via presence** — if a tool's file is in the directory, it's registered. Removing a tool = deleting a file.
3. **Availability check inline** — `check_fn` lets the tool gate itself by env var presence, so missing credentials just hide the tool from the LLM rather than crashing.
4. **Single source of truth for schemas** — the same object that has the handler knows its JSON Schema.

**Typescript port (proposed for Zeno if needed):**

TS doesn't have Python's import-time side effects by default with ESM, but you can emulate:

```ts
// src/agent/tool-registry.ts
export interface ToolDef<I, O> {
  name: string;
  description: string;
  inputSchema: unknown;           // JSON schema or Zod
  check?: () => boolean;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

class ToolRegistry {
  private tools = new Map<string, ToolDef<any, any>>();
  register(tool: ToolDef<any, any>) { this.tools.set(tool.name, tool); }
  list() { return [...this.tools.values()].filter(t => !t.check || t.check()); }
  get(name: string) { return this.tools.get(name); }
}
export const registry = new ToolRegistry();
```

```ts
// src/agent/tools/example.ts
import { registry } from '@/agent/tool-registry';
registry.register({
  name: 'example',
  description: '...',
  inputSchema: { /* ... */ },
  check: () => !!process.env.EXAMPLE_API_KEY,
  handler: async (input, ctx) => ({ ok: true }),
});
```

```ts
// src/agent/tools/index.ts — imports everything
import '@/agent/tools/example';
import '@/agent/tools/other';
// ...
```

**Caveat for Zeno today:** we use Claude Code's built-in tools (`Bash`, `Read`, `Glob`, `Grep`) via the Agent SDK. Custom tools go through the SDK's `tool()` + `createSdkMcpServer()` API, which isn't exactly this registry pattern — but you could wrap your own registry around it to get the same "drop a file, tool is live" ergonomics. Only worth doing once you have 3+ custom tools.

**When NOT to adopt this:**
- MVP with zero custom tools (Zeno today). Overhead > value.
- Small number of tools where manual index is fine.
- Tools with complex shared state / ordering requirements.
