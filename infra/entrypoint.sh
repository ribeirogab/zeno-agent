#!/bin/sh
# Zeno container entrypoint.
# Merges skills from /app/agent/skills (built-in) and /app/profile/skills (user)
# into /home/node/.claude/skills so the Claude Agent SDK's user-level setting
# source picks up both. Profile skills override agent skills on name collision.
set -eu

AGENT_SKILLS=/app/agent/skills
PROFILE_SKILLS=/app/profile/skills
DEST=/home/node/.claude/skills

[ -d "$AGENT_SKILLS" ] || { echo "skills_bootstrap_failed: $AGENT_SKILLS missing" >&2; exit 1; }
[ -d "$PROFILE_SKILLS" ] || { echo "skills_bootstrap_failed: $PROFILE_SKILLS missing" >&2; exit 1; }

mkdir -p "$DEST"

for d in "$AGENT_SKILLS"/*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  ln -sfn "$d" "$DEST/$name"
done

for d in "$PROFILE_SKILLS"/*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  if [ -L "$DEST/$name" ]; then
    echo "skill_override: profile/$name replaces agent/$name" >&2
  fi
  ln -sfn "$d" "$DEST/$name"
done

exec "$@"
