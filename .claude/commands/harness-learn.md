---
description: Investigate a topic in the project and save what you learn to the vault
argument-hint: <what to investigate>
---

# Learn — Deep Dive and Document

Investigate `$ARGUMENTS` in the current project, then — **only if the finding clears the bar below** — save it as an atomic learning note in `context/learnings/`.

**Announce at start:** "Investigating: $ARGUMENTS"

## What to learn — and what to skip

The vault is shared brain for every agent and human who will ever work on this project. Most of what you investigate is **not** worth saving. Be ruthless.

**Save it** only when all of these are true:
- It would be **indispensable** for another agent or contributor picking this up later — without it they would waste real time or make a wrong decision.
- It is **non-obvious from the code itself** (a hidden constraint, a why-this-not-that decision, a gotcha, a load-bearing convention not visible at the call site).
- It is **specific to this project** — not generic framework/language knowledge.
- It will not **rot in a week** — architectural truths, durable constraints, repeating gotchas; not transient debugging state.

**Skip it** when:
- The code, types, or grep already reveal it.
- It only mattered for a one-off bug — the commit message is enough.
- You are tempted to save "just in case" or to feel productive — that is noise, and noise dilutes the vault.
- It is general knowledge about React / Postgres / pnpm / etc.

If after investigating nothing clears the bar, **say so explicitly and stop**. Do not invent a learning to justify the command — an empty result is a valid result.

## Protocol

### 1. Investigate

Dig into the codebase to understand the topic. Use whatever tools are needed:

- Read relevant source files, configs, scripts, CI pipelines, Dockerfiles
- Check git history for context (`git log --oneline --all -- <relevant paths>`)
- Read existing docs, README sections, inline comments
- Trace the flow end-to-end when applicable (e.g., for deploy: from commit to production)

**Go deep, not wide.** Follow the chain until you can explain it to someone who has never seen this project.

### 2. Apply the bar — does this clear it?

Before writing anything, evaluate the finding against the **What to learn — and what to skip** criteria above. If it does not clear all four "Save it" conditions, **stop here**: report what you found in one or two sentences and state explicitly that nothing was saved (and why). Skip the remaining steps.

### 3. Check for duplicates

Search `context/learnings/` for existing notes on the same topic:

```
grep -rl "<keywords>" context/learnings/
```

If a related note already exists, update it instead of creating a new one.

### 4. Write the learning note

Create `context/learnings/<kebab-slug>.md` using the project template:

```markdown
---
tags:
  - learning
  - <category: concept | reference | gotcha>
related:
  - "[[related-note-if-any]]"
created: <YYYY-MM-DD>
---
# <Title>

<One paragraph: what this is and why it matters>

## Context

<Where this was discovered — what triggered the investigation>

## How It Works

<The actual findings. Be specific: file paths, commands, config values, flow steps.
Write enough that someone reading this note can act on it without re-investigating.>

## How to Apply

<Concrete, actionable takeaway: what to do with this knowledge>
```

### 5. Update the MOC

Add a wikilink to the new note in `context/_index/learnings.md` under the appropriate category section.

### 6. Report

Show a brief summary (3-5 bullets) of what was learned and the path to the saved note.
