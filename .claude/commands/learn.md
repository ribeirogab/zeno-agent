---
description: Investigate a topic in the project and save what you learn to the vault
argument-hint: <what to investigate>
---

# Learn — Deep Dive and Document

Investigate `$ARGUMENTS` in the current project, then save the findings as an atomic learning note in `context/learnings/`.

**Announce at start:** "Investigating: $ARGUMENTS"

## Protocol

### 1. Investigate

Dig into the codebase to understand the topic. Use whatever tools are needed:

- Read relevant source files, configs, scripts, CI pipelines, Dockerfiles
- Check git history for context (`git log --oneline --all -- <relevant paths>`)
- Read existing docs, README sections, inline comments
- Trace the flow end-to-end when applicable (e.g., for deploy: from commit to production)

**Go deep, not wide.** Follow the chain until you can explain it to someone who has never seen this project.

### 2. Check for duplicates

Search `context/learnings/` for existing notes on the same topic:

```
grep -rl "<keywords>" context/learnings/
```

If a related note already exists, update it instead of creating a new one.

### 3. Write the learning note

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

### 4. Update the MOC

Add a wikilink to the new note in `context/_index/learnings.md` under the appropriate category section.

### 5. Report

Show a brief summary of what was learned (3-5 bullet points) and the path to the saved note.
