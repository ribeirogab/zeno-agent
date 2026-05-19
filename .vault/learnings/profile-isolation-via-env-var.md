---
tags:
  - learning
  - reference
related:
  - "[[hermes-architecture]]"
  - "[[lessons-for-zeno-from-openclaw-hermes]]"
  - "[[multi-agent-routing-channels-to-agents]]"
created: 2026-04-15
---
# Profile isolation via a single env var (Hermes `HERMES_HOME`)

Hermes' trick for running multiple fully isolated instances on the same machine: one env var, `HERMES_HOME`, that resolves before any module imports. All state paths (`config.yaml`, `.env`, `sessions/`, `skills/`, etc.) are derived from `get_hermes_home()` instead of `Path.home() / ".hermes"`. Switching profile = switching one env var.

## Context

Studied 2026-04-15. Useful pattern for Zeno if we ever want multiple Zeno instances on the same host — e.g., one for work credentials, one for personal. Or parallel Zenos for testing.

## How to Apply

**The pattern:**

```python
# hermes_cli/main.py — runs BEFORE any module imports
def _apply_profile_override():
    # If `hermes -p coder ...` or env HERMES_PROFILE is set,
    # redirect HERMES_HOME to ~/.hermes/profiles/<name>/.
    if profile := args.profile or os.environ.get("HERMES_PROFILE"):
        os.environ["HERMES_HOME"] = str(Path.home() / ".hermes" / "profiles" / profile)

# hermes_constants.py — single source of truth
def get_hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes")))

def display_hermes_home() -> str:
    # ~/.hermes  OR  ~/.hermes/profiles/<name>
    return str(get_hermes_home()).replace(str(Path.home()), "~")
```

Every other file uses `get_hermes_home()` — Hermes has 119+ call sites. Rule: **never hardcode `~/.hermes` in code that reads or writes state.** Hermes ran into 5 bugs from that; PR #3575 fixed them.

**Why the `_apply_profile_override` timing matters:**
- Runs **before** any import of modules that capture paths.
- Module-level constants like `CONFIG_PATH = get_hermes_home() / "config.yaml"` get evaluated at import time, which is AFTER the override — so they stay profile-scoped.
- If you capture `~/.hermes` at module load without the env var trick, profiles silently break.

**Testing rule (from Hermes' test infra):**
```python
# tests/conftest.py — autouse fixture
@pytest.fixture(autouse=True)
def _isolate_hermes_home(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setenv("HERMES_HOME", str(home))
```

Every test runs in a fresh `~/.hermes/` — no cross-test state leaks, no accidental writes to the user's real home.

**Profile operations are HOME-anchored, not HERMES_HOME-anchored:**
`_get_profiles_root()` returns `Path.home() / ".hermes" / "profiles"` — not `get_hermes_home() / "profiles"`. This is intentional: `hermes -p coder profile list` must show all profiles regardless of which one is active.

**Credential locking:**
Gateway platform adapters that connect with a credential (bot token, API key) call `acquire_scoped_lock()` on connect and `release_scoped_lock()` on disconnect. Prevents two profiles from using the same token.

## How to Apply to Zeno

Zeno doesn't have this pattern today because we don't need it yet. But if/when a second Zeno instance is desired (e.g., work vs personal), this is the blueprint:

1. **One env var:** `ZENO_HOME`. Default: `/app` in container, `./` locally.
2. **Single accessor:** `getZenoHome(): string` in `@/config`. Every file uses it — no hardcoded `./USER.md`.
3. **Profile override:** CLI flag or env var `ZENO_PROFILE` at process start, resolves `ZENO_HOME` before module loads.
4. **Docker implication:** each Zeno instance gets its own container with `ZENO_HOME` set differently, mounting different volumes (`./profiles/work/USER.md`, `./profiles/work/skills/`, etc.).

**When this actually matters:**
- You want work vs personal to be hard-isolated at the filesystem level, not trusted by Slack routing (see `[[multi-agent-routing-channels-to-agents]]`).
- You run the same Zeno codebase against multiple Claude accounts (rare).
- Testing: running Zeno under pytest-equivalent parallelism without shared state.

**Don't adopt until:**
- There's a concrete second instance. Adding the indirection preemptively is overhead without benefit.
- File paths are actually diverging between contexts. Today Zeno has 1 USER.md — no scoping problem yet.

**Summary:** this is on the shelf. When the need appears, the recipe is 20 lines of code. Until then, don't generalize.
