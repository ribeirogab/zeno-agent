---
name: memex-link
description: "Analyze the vault for missing related: frontmatter cross-links and present suggestions interactively. Conservative: only surfaces high-evidence (wikilink already in body) and medium-evidence (filepath/title in body, or shared title/H2 terms) candidates. Never edits without explicit per-item user confirmation. Use when the user asks to find missing related: links in the vault, when /memex-sweep flags an isolated spec, or as part of the After-completing-a-spec reflection."
---

# Memex Link — Vault Cross-Link Suggestions

Analyze the `.vault/` vault and surface candidate `related:` frontmatter additions where genuinely necessary.

**Announce at start:** "Analyzing vault for missing cross-links..."

## Mode of Operation

Four phases. Detection is deterministic (Bash). Presentation and editing are interactive (agent + user).

1. **Detect** — invoke `scripts/find-candidates.sh "$SCOPE"` (where `$SCOPE` is the optional argument from the slash command).
2. **Classify** — read JSON from stdout; map `evidence_type` to confidence (high/medium).
3. **Present** — render markdown table grouped by confidence, with one-line rationale.
4. **Loop** — interactive y/n/skip-rest per item; on `y`, edit source's `related:` frontmatter to add the wikilink.

If no candidates surface, say `No cross-link suggestions. Vault is well-connected.` and stop.

## Phase 1 — Detect

Sanity-check `command -v jq` first — if absent, abort with `memex-link requires jq. Install with: brew install jq` (or platform-appropriate hint).

Then run the deterministic detector:

```bash
SCOPE="$1"   # optional argument from slash command
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
bash "$SKILL_DIR/scripts/find-candidates.sh" "$SCOPE" > /tmp/memex-link-candidates.json
```

If the script exits with code 2, surface its stderr and stop. If exit 0 and stdout is `[]`, report "Vault is well-connected" and stop.

## Phase 2 — Classify

For each candidate, map `evidence_type` to confidence:

| `evidence_type` | Confidence |
|---|---|
| `wikilink_in_body` | high |
| `filepath_in_body` | medium |
| `title_in_body` | medium |
| `shared_heading_terms` | medium |

No "low" bucket; the script does not emit anything that would qualify.

## Phase 3 — Present

Render a markdown table grouped by confidence:

```markdown
## Cross-Link Suggestions — N candidates (H high, M medium)

| # | conf | source → target | rationale |
|---|---|---|---|
| 1 | high | spec-rename… → memex | wikilink in body line 14 |
| 2 | medium | sweep → mechanical-enforcement-over-prose | shared H2 terms: feedforward, feedback |
```

## Phase 4 — Interactive loop

For each candidate, in order, prompt the user:

```
[1/3] HIGH — .vault/specs/.../spec-X.md → .vault/learnings/Y.md
       Reason: wikilink in body line 14

       Add to source's `related:`? (y/n/skip-rest)
```

Receive user input (single character):

- **`y`** — edit the source's frontmatter:
    - Read source file
    - Locate the YAML frontmatter (between the first two `---` fences)
    - Find or insert the `related:` field
    - Add a wikilink to the target using the canonical relative path: from source's directory to target's path. Compute with `realpath --relative-to=$(dirname source) target` (or equivalent for macOS).
        - For specs/&lt;date&gt;/spec-X.md → learnings/Y.md, the wikilink is `[[../../learnings/Y]]`.
        - For learnings/X.md → learnings/Y.md, the wikilink is `[[Y]]`.
    - Write the file back. Use multi-line block list form for `related:` (uniformity with existing notes).
    - **Edit safety**: re-stat the source file's mtime before writing. If mtime > the time at which Phase 1 ran, abort that single edit with `Source modified externally — skipping.` Continue loop.
    - **Edit safety**: if the existing `related:` value is not a list (e.g., a string or mapping), abort that single edit with `Cannot edit <path>: related field has unexpected shape. Skipping. Open the file and fix manually.` Continue loop.

- **`n`** — skip; record locally as rejected (not persisted across runs); continue.

- **`skip-rest`** or `s` — terminate the loop.

After the loop, print summary:

```
Done. N accepted, M rejected, K skipped.
Edits applied to: <list of files>
```

Do not auto-commit. The user decides when.

## Self-test

The skill ships a fixture-based test for the deterministic detector. To run:

```bash
bash .agents/skills/memex-link/tests/run.sh
```

Expected output: `PASS`. Run before committing any change to the script.
