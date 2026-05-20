---
tags:
  - learning
  - docker
  - operations
related:
  - "[[../specs/2026-05-20-agents-md-per-instance/spec-agents-md-per-instance|spec 2026-05-20 agents-md-per-instance]]"
  - "[[docker-multi-profile-via-compose]]"
created: 2026-05-20
---
# Renaming a file inside a bind-mounted profile directory is coupled to the container rebuild cycle

Each Zeno profile mounts `~/.zeno/profiles/<name>/` read-only at `/app/profile/`. The worker reads specific filenames at boot (e.g., `AGENTS.md`). If a refactor renames one of those filenames, the rename cannot land on disk until the worker that knows the new name is running — otherwise the running worker (still expecting the old name) boots without context and warns `*_md_missing`.

The safe sequence is: rebuild the image with the new code FIRST (`zeno restart fn --build`), then delete the old file from the bind-mount source after the new code is verified by checking the boot log. Doing the rename before the rebuild leaves the running container in a degraded state for the gap between the file rename and the next restart.

The corollary is that for transitions of this shape it is fine to have BOTH names coexist on disk during the gap. The new code reads only the new name; the old code reads only the old name. Whichever container is currently running picks up its file. The cleanup happens after the new code is in place.

## Context

Implementing spec 2026-05-20 (USER.md → AGENTS.md). The FN profile was running pre-refactor code throughout the implementation. The risk was: if I renamed `USER.md` → `AGENTS.md` before rebuilding the container, the running worker would lose its per-profile operating manual until the next rebuild. Mitigation was to write the new `AGENTS.md` content NEXT TO the existing `USER.md`, leave both, run `zeno restart fn --build`, verify `agents_md_loaded` in the new container's boot log, then delete `USER.md`.

Also: `zeno restart fn --build` is the right one-shot for this pattern. `zeno stop fn` followed by `zeno start fn --build` has the same end state but spends time with the container fully down; `restart --build` is atomic from the operator's point of view.

## How to Apply

- When a refactor renames a file the worker reads from the bind-mount, sequence: write new file → rebuild container → verify boot log → delete old file. Never delete the old file before the rebuild.
- Prefer `zeno restart fn --build` over `stop && start --build` for live profiles — same effect, less downtime.
- Always verify the new code is up by `grep`ing the docker logs for the new event name (e.g., `agents_md_loaded`) before deleting the obsoleted file. Silence is not success; an absent event means the new code didn't load.
- The plan's phase ordering must reflect this constraint. Phase "rebuild image" precedes phase "delete obsolete file"; neither is the same as "stop running container".
