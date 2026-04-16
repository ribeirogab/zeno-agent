---
tags:
  - learning
  - reference
related:
  - "[[openclaw-architecture]]"
  - "[[agent-skills-open-standard]]"
  - "[[tool-registry-autodiscovery-pattern]]"
  - "[[closed-learning-loop-self-improving-skills]]"
  - "[[profile-isolation-via-env-var]]"
  - "[[lessons-for-zeno-from-openclaw-hermes]]"
created: 2026-04-15
---
# Hermes Agent (Nous Research) — architecture reference

Hermes Agent (`github.com/NousResearch/hermes-agent`, docs at `hermes-agent.nousresearch.com`) is Nous Research's Python-based "self-improving AI agent" with a closed learning loop: it creates skills from experience, improves them during use, nudges itself to persist knowledge, searches its own past conversations via FTS5, and builds a deepening model of the user across sessions. Runs on $5 VPS / serverless (Modal, Daytona) with hibernation.

## Context

Studied 2026-04-15 alongside OpenClaw as part of competitive analysis for Zeno. Hermes is the most research-oriented and technically ambitious personal-agent framework — very different positioning from OpenClaw's "practical messaging assistant".

## How to Apply

**Project layout (highlights):**
```
hermes-agent/
├── run_agent.py              # AIAgent class — core conversation loop
├── model_tools.py            # handle_function_call(), discover_builtin_tools()
├── toolsets.py               # _HERMES_CORE_TOOLS list
├── cli.py                    # HermesCLI — interactive TUI
├── hermes_state.py           # SessionDB (SQLite + FTS5)
├── agent/
│   ├── prompt_builder.py
│   ├── context_compressor.py
│   ├── prompt_caching.py
│   ├── skill_commands.py
│   ├── trajectory.py
│   └── display.py            # KawaiiSpinner
├── hermes_cli/
│   ├── main.py               # `hermes` CLI entry (profile override happens here)
│   ├── config.py             # DEFAULT_CONFIG + OPTIONAL_ENV_VARS
│   ├── commands.py           # COMMAND_REGISTRY (central slash-command spec)
│   ├── setup.py              # hermes setup wizard
│   ├── skills_config.py      # hermes skills
│   ├── tools_config.py       # hermes tools
│   ├── skills_hub.py         # /skills
│   └── skin_engine.py        # CLI theming
├── tools/
│   ├── registry.py           # central ToolRegistry
│   ├── <one file per tool>   # each calls registry.register() at import time
│   └── environments/         # terminal backends: local, docker, ssh, modal, daytona, singularity
├── gateway/
│   ├── run.py                # messaging loop + slash commands
│   ├── session.py            # SessionStore
│   └── platforms/            # telegram, discord, slack, whatsapp, signal, qqbot, homeassistant
├── acp_adapter/              # Agent Client Protocol (VS Code / Zed / JetBrains)
├── cron/
├── environments/             # RL training envs (Atropos)
└── tests/                    # ~3000 tests
```

**User state (`~/.hermes/` — scoped via `HERMES_HOME` env var for profiles):**
```
~/.hermes/
├── config.yaml               # settings
├── .env                      # API keys
├── skills/                   # agent-created + user-installed skills
├── sessions/                 # SQLite SessionDB with FTS5
├── plugins/                  # user-dropped Python files (MCP server integration)
└── profiles/<name>/          # isolated instances (own HERMES_HOME)
```

**AIAgent class (run_agent.py, synchronous loop):**
```python
class AIAgent:
    def __init__(self,
        model: str = "anthropic/claude-opus-4.6",
        max_iterations: int = 90,
        enabled_toolsets: list = None,
        disabled_toolsets: list = None,
        platform: str = None,           # "cli" | "telegram" | …
        session_id: str = None,
        skip_context_files: bool = False,
        skip_memory: bool = False,
    ): ...

    def run_conversation(self, user_message, system_message=None,
                         conversation_history=None, task_id=None) -> dict:
        ...
```

**Core loop (synchronous):**
```python
while api_call_count < self.max_iterations and self.iteration_budget.remaining > 0:
    response = client.chat.completions.create(
        model=model, messages=messages, tools=tool_schemas)
    if response.tool_calls:
        # Parallel execution unless tool is marked unsafe for concurrency
        for tool_call in response.tool_calls:
            result = handle_function_call(tool_call.name, tool_call.args, task_id)
            messages.append(tool_result_message(result))
        api_call_count += 1
    else:
        return response.content
```

**IterationBudget:** thread-safe `consume()`/`refund()`. Parent default **90**, subagent default **50**. `execute_code` tool can `refund()` so internal logic doesn't penalize the budget.

**Tool registry pattern (elegant — see `[[tool-registry-autodiscovery-pattern]]`):**
- `tools/registry.py` has a singleton `registry`.
- Each `tools/*.py` calls `registry.register(name, toolset, schema, handler, check_fn, requires_env)` at import time.
- `model_tools.py` imports everything from `tools/` — auto-discovery, no manual lists.

**Message flow (strict):**
```
[0]       system   — cached prompt with tool definitions
[1..n]    user/asst — prefill_messages (ephemeral pre-loads)
[n+1..m]  user/asst — conversation_history from SQLite
[m+1]     user     — current message
```

**Prompt caching policy (critical):**
Hermes **never alters past context mid-conversation** — no toolset changes, no memory reloads, no system-prompt rebuilds mid-session. The ONLY exception is context compression. Violating this breaks Anthropic's prompt cache and multiplies cost.

**Terminal backends (6 options — `tools/environments/`):**
- `local`, `docker`, `ssh`, `modal` (serverless with hibernation), `daytona`, `singularity` (HPC). Swappable via config — agent command execution abstracted behind uniform interface.

**Gateway platforms (7+): Telegram, Discord, Slack, WhatsApp, Signal, QQ, HomeAssistant, Email. Single `hermes gateway start` serves all. Slash commands shared across platforms via `COMMAND_REGISTRY` — adding an alias is one tuple entry, propagates to CLI dispatch, Telegram BotCommand menu, Slack subcommand routing, autocomplete, and help.**

**Memory layers:**
- **Short-term**: session SQLite DB in `~/.hermes/sessions/`, FTS5 for search.
- **Long-term**: `MEMORY.md` + `USER.md` (plain markdown, OpenClaw-compatible).
- **Procedural**: `~/.hermes/skills/` Python procedures.
- **User modeling**: `HonchoSessionManager` — dialectic model of "who you are".

**Skills:**
- Compatible with agentskills.io.
- Auto-created by agent after complex tasks (observation → generalization).
- Self-improving during use.
- Can migrate from OpenClaw: `hermes claw migrate [--dry-run|--preset|--overwrite]`.

**Configuration:**
- `~/.hermes/config.yaml` + `~/.hermes/.env`. Interactive setup: `hermes setup`.
- `config.yaml` versioned — `_config_version: 5`; bump triggers migration on existing installs.
- Model-agnostic: 200+ models via OpenRouter, Nous Portal, Anthropic, OpenAI, HF, custom endpoints.

**Distinctive strengths:**
1. **Self-improving skills** — closed learning loop that few other agents attempt.
2. **Serverless-ready** (Modal, Daytona) — hibernate between requests, low idle cost.
3. **Multi-instance via profiles** — `HERMES_HOME` env var isolates everything.
4. **Central command registry** — one source of truth for slash commands across CLI + 6 platforms.
5. **ACP adapter** — plugs into VS Code / Zed / JetBrains directly.
6. **~3000 tests** — high confidence in refactors.
7. **Auto-discovery tool registry** — clean extension story.

**Distinctive costs:**
- Python + `uv` + Python 3.11 specific — different stack than TS projects.
- Synchronous agent loop (threads for parallel tools) — can't trivially do async Node-style.
- Complex setup surface: 6 terminal backends, 7+ platforms, profile management, skill hub, skin engine, ACP adapter. "Simple path" is one thing; the product is a big kitchen.
- Honcho + FTS5 + prompt caching preservation rules — lots of invariants that must hold.
- Self-improving skills is powerful but uncertain ROI for personal single-user scope.

**When it's the right tool:** you want serverless deployment, multi-platform from day one, aggressive context memory + learning, or you're doing AI research on agent self-improvement.

**When it's overkill for Zeno:** single-user, single-platform, TS codebase. Inspiration yes, wholesale copy no. See `[[lessons-for-zeno-from-openclaw-hermes]]`.
