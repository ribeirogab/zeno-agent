---
name: harness-recall
description: "Search the vault for context on a topic"
---

# Recall — Project Context Scout

Quick reconnaissance of the `context/` vault. Gives the agent a working map of where things are and what the project cares about, without deep-diving into every file.

**Announce at start:** "Running project reconnaissance..."

## Protocol

Execute these steps in order. Read files — do not edit anything.

### 1. Structure scan

Run a glob for `context/**/*.md` to get the file tree. Present it as a compact list grouped by folder.

### 2. Constitution (skim)

Read `context/constitution.md`. Extract and list:
- The "Why" summary (1-2 sentences)
- Scope guardrails (bullet list)
- Architecture principles (bullet list)

### 3. MOCs (index scan)

Read all files in `context/_index/`. For each MOC, list the entries it links to (just the note names, not full content).

### 4. Report

Output a single structured summary:

## Project Recon

**What:** <one-line project description from constitution>
**Stack:** <from learnings or AGENTS.md>

### Knowledge Map
- Constitution: <count> principles
- Specs: <count> shipped, <count> active
- Learnings: <count> notes — <topic list>
- Conventions: <count> notes — <topic list>
- Rules: <count> notes

### Key Pointers
- <any important architectural decisions or constraints worth flagging>

Keep the whole output **under 40 lines**. This is a map, not a book report.
