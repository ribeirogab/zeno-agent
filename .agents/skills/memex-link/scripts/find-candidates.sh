#!/usr/bin/env bash
# find-candidates.sh — Detect missing related: cross-links in the memex vault.
# Output: JSON array on stdout (or "[]" if no candidates).
# Errors/warnings on stderr. Exit codes: 0 success, 2 fatal.
# Usage: find-candidates.sh [scope]
#   scope (optional): path, folder name, or empty (whole vault).
# Requires: bash >= 3.2, jq, find, awk, grep, sort, comm, tr.
#
# Performance: O(N²) pair scan over notes, but each iteration is mostly
# cache hits. Per-note metadata (body, title, headings, tokens, related)
# is pre-computed once into a temp dir; the inner loop reads from disk
# via shell builtin redirection or direct grep on the cached body file.
# Subprocess count drops from ~15 per pair to ~2-4 per pair.
#
# Note: pipefail intentionally omitted. The script has many
# `producer | early-exit-consumer` pipelines (e.g. `grep -m1 ... | cut`,
# `comm | grep -v`). With pipefail, the producer gets SIGPIPE when the
# consumer closes stdin early, exits 141, and the pipeline aborts.
# Pipelines that need failure detection use `{ ... || true; }` blocks.
set -eu

SCOPE="${1:-}"

if [ ! -d vault ]; then
  echo "FATAL: vault/ not found. Run from a directory containing vault/." >&2
  exit 2
fi

STOPWORDS_RE='^(the|a|an|of|in|on|by|and|or|for|to|with|is|this|that|repo|skill|skills|vault|agent|agents|context|note|notes|learning|learnings|spec|specs|how|what|why|when|where|works|use|using|over)$'

CACHE=$(mktemp -d 2>/dev/null || mktemp -d -t memex-link)
trap 'rm -rf "$CACHE"' EXIT

# ----- helpers -----

all_notes() {
  find vault/learnings vault/conventions vault/rules vault/specs \
    -type f -name '*.md' 2>/dev/null \
    | grep -v '^vault/specs/_template/' \
    | grep -Ev '/plan-[^/]+\.md$' \
    | grep -Ev '/tasks-[^/]+\.md$' \
    | sort
}

notes_in_scope() {
  if [ -z "$SCOPE" ]; then all_notes; return; fi
  if [ -f "$SCOPE" ]; then echo "$SCOPE"
  elif [ -d "$SCOPE" ]; then all_notes | grep "^${SCOPE%/}/"
  else all_notes | { awk -v p="$SCOPE" 'index($0, p)' || true; }
  fi
}

# enc_path — encode a path into a filename-safe key (replace / with _).
# Bash parameter expansion: zero forks.
enc_path() {
  local s="$1"
  printf '%s' "${s//\//_}"
}

# precompute — for each note, write 5 metadata files into $CACHE:
#   $CACHE/$enc.body          full body (post-frontmatter)
#   $CACHE/$enc.title         first H1 line content (or empty)
#   $CACHE/$enc.related       related[] basenames, one per line
#   $CACHE/$enc.tokens        sorted unique tokens from title + H2 headings
# This is O(N) work done once; subsequent O(N²) pair scan reads cache.
precompute() {
  local note enc
  while IFS= read -r note; do
    [ -z "$note" ] && continue
    enc="${note//\//_}"

    # Body, title, H2s extracted in a single awk pass per file.
    awk -v body_f="$CACHE/$enc.body" \
        -v title_f="$CACHE/$enc.title" \
        -v h2s_f="$CACHE/$enc.h2s" '
      BEGIN { n=0; in_body=0; h1_done=0 }
      /^---$/ { n++; if (n>=2) in_body=1; next }
      in_body && /^# / && !h1_done {
        line=$0; sub(/^# /, "", line)
        print line > title_f
        h1_done=1
        print > body_f
        next
      }
      in_body && /^## / {
        line=$0; sub(/^## /, "", line)
        print line > h2s_f
        print > body_f
        next
      }
      in_body { print > body_f }
    ' "$note"

    # Ensure files exist even if empty.
    [ -f "$CACHE/$enc.body" ]  || : > "$CACHE/$enc.body"
    [ -f "$CACHE/$enc.title" ] || : > "$CACHE/$enc.title"
    [ -f "$CACHE/$enc.h2s" ]   || : > "$CACHE/$enc.h2s"

    # related[] basenames from frontmatter.
    awk '
      BEGIN { n=0; in_rel=0 }
      /^---$/ { n++; if (n>=2) exit; next }
      n==1 && /^related:/ { in_rel=1; next }
      n==1 && in_rel && /^[a-zA-Z][a-zA-Z_-]*:/ { in_rel=0 }
      n==1 && in_rel && /^[[:space:]]*-[[:space:]]/ {
        sub(/^[[:space:]]*-[[:space:]]*/, "")
        sub(/^"?\[\[/, "")
        sub(/\]\]"?[[:space:]]*$/, "")
        i = index($0, "|")
        if (i) $0 = substr($0, 1, i-1)
        n2 = match($0, /\/[^\/]+$/)
        if (n2) $0 = substr($0, n2+1)
        print
      }
    ' "$note" > "$CACHE/$enc.related"

    # Combined tokens (title + H2s), tokenized + sorted unique.
    cat "$CACHE/$enc.title" "$CACHE/$enc.h2s" \
      | tr '[:upper:]' '[:lower:]' \
      | tr -cs '[:alnum:]' '\n' \
      | { awk 'length($0) >= 3' || true; } \
      | { grep -Ev "$STOPWORDS_RE" || true; } \
      | sort -u > "$CACHE/$enc.tokens"
  done
}

# ----- pre-compute pass -----

all_targets=$(all_notes)
sources=$(notes_in_scope)

n_targets=$(printf '%s\n' "$all_targets" | { grep -c . || true; })
n_sources=$(printf '%s\n' "$sources" | { grep -c . || true; })

# ----- progress to stderr (always on; quiet via 2>/dev/null) -----

echo "[memex-link] $n_targets notes in vault, $n_sources sources in scope" >&2
echo "[memex-link] phase 1/2: pre-computing metadata..." >&2
t_start=$(date +%s)

printf '%s\n' "$all_targets" | precompute

t_pre=$(date +%s)
echo "[memex-link] pre-compute done in $((t_pre - t_start))s. phase 2/2: scanning $((n_sources * n_targets)) pairs..." >&2

# ----- pair scan -----

emitted="$CACHE/emitted.ndjson"
: > "$emitted"

src_idx=0
last_progress_t=$t_pre

while IFS= read -r src; do
  [ -z "$src" ] && continue
  src_idx=$((src_idx + 1))

  # Throttle progress: emit at most once per second.
  now=$(date +%s)
  if [ $((now - last_progress_t)) -ge 1 ]; then
    pct=$((src_idx * 100 / n_sources))
    n_so_far=$({ wc -l < "$emitted" 2>/dev/null || echo 0; } | tr -d ' ')
    echo "[memex-link] $src_idx/$n_sources sources scanned ($pct%) — $n_so_far candidates so far" >&2
    last_progress_t=$now
  fi

  src_enc="${src//\//_}"
  src_dir="${src%/*}"

  src_body_f="$CACHE/$src_enc.body"
  src_tokens_f="$CACHE/$src_enc.tokens"
  src_title=$(<"$CACHE/$src_enc.title")
  if [ -z "$src_title" ]; then
    src_basename="${src##*/}"
    src_title="${src_basename%.md}"
  fi

  # Pre-load related[] as space-separated string for O(1) bash case match.
  src_related_str=" $(tr '\n' ' ' < "$CACHE/$src_enc.related") "

  while IFS= read -r tgt; do
    [ -z "$tgt" ] && continue
    [ "$src" = "$tgt" ] && continue

    tgt_basename="${tgt##*/}"
    tgt_basename="${tgt_basename%.md}"

    # Filter: target already in source's related (bash case, no fork).
    case "$src_related_str" in
      *" $tgt_basename "*) continue ;;
    esac

    # Filter: plan/tasks intra-pair within same spec folder.
    tgt_dir="${tgt%/*}"
    if [ "$src_dir" = "$tgt_dir" ]; then
      tgt_base="${tgt##*/}"
      case "$tgt_base" in
        plan-*|tasks-*) continue ;;
      esac
    fi

    tgt_enc="${tgt//\//_}"
    tgt_title=$(<"$CACHE/$tgt_enc.title")
    [ -z "$tgt_title" ] && tgt_title="$tgt_basename"

    evidence=""; detail=""

    # Evidence 1: wikilink in body. Direct grep on disk file.
    if grep -qE "\[\[([^]|]*/)?$tgt_basename(\||\]\])" "$src_body_f"; then
      line=$(grep -m1 -nE "\[\[([^]|]*/)?$tgt_basename(\||\]\])" "$src_body_f" | cut -d: -f1)
      evidence="wikilink_in_body"; detail="[[$tgt_basename]] cited at body line $line"

    # Evidence 2: filepath in body.
    elif grep -qF "$tgt" "$src_body_f"; then
      line=$(grep -m1 -nF "$tgt" "$src_body_f" | cut -d: -f1)
      evidence="filepath_in_body"; detail="filepath '$tgt' at body line $line"

    # Evidence 3: title in body (only for titles >= 10 chars).
    elif [ -n "$tgt_title" ] && [ "${#tgt_title}" -ge 10 ] \
         && grep -qiF "$tgt_title" "$src_body_f"; then
      line=$(grep -m1 -niF "$tgt_title" "$src_body_f" | cut -d: -f1)
      evidence="title_in_body"; detail="title '$tgt_title' at body line $line"

    # Evidence 4: shared title+H2 tokens >= 2.
    else
      tgt_tokens_f="$CACHE/$tgt_enc.tokens"
      shared=$(comm -12 "$src_tokens_f" "$tgt_tokens_f" | { grep -v '^$' || true; })
      if [ -n "$shared" ]; then
        shared_count=$(printf '%s\n' "$shared" | { grep -c . || true; })
        if [ "$shared_count" -ge 2 ]; then
          evidence="shared_heading_terms"
          detail="shared title/H2 terms: $(printf '%s' "$shared" | tr '\n' ',' | sed 's/,$//')"
        fi
      fi
    fi

    if [ -n "$evidence" ]; then
      jq -nc \
        --arg source "$src" --arg target "$tgt" \
        --arg source_title "$src_title" --arg target_title "$tgt_title" \
        --arg evidence_type "$evidence" --arg evidence_detail "$detail" \
        '{source:$source,target:$target,source_title:$source_title,target_title:$target_title,evidence_type:$evidence_type,evidence_detail:$evidence_detail}' \
        >> "$emitted"
    fi

  done <<< "$all_targets"
done <<< "$sources"

t_end=$(date +%s)
n_emitted=$({ wc -l < "$emitted" 2>/dev/null || echo 0; } | tr -d ' ')
echo "[memex-link] done in $((t_end - t_start))s — $n_emitted candidates emitted" >&2

if [ ! -s "$emitted" ]; then
  echo "[]"
else
  jq -s '.' "$emitted"
fi
