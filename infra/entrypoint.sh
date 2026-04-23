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

# Git identity from config.yaml (github_app.git_identity) — profile first, agent fallback
CONFIG_FILE=""
for candidate in /app/profile/config.yaml profile/config.yaml /app/agent/config.yaml agent/config.yaml; do
  if [ -f "$candidate" ] && grep -q 'git_identity:' "$candidate" 2>/dev/null; then
    CONFIG_FILE="$candidate"
    break
  fi
done

if [ -n "$CONFIG_FILE" ]; then
  GIT_NAME=$(grep -A2 'git_identity:' "$CONFIG_FILE" | grep 'name:' | sed 's/.*name: *"\{0,1\}\([^"]*\)"\{0,1\}/\1/' | head -1)
  GIT_EMAIL=$(grep -A3 'git_identity:' "$CONFIG_FILE" | grep 'email:' | sed 's/.*email: *"\{0,1\}\([^"]*\)"\{0,1\}/\1/' | head -1)
  if [ -n "$GIT_NAME" ] && [ -n "$GIT_EMAIL" ]; then
    git config --global user.name "$GIT_NAME"
    git config --global user.email "$GIT_EMAIL"
  fi
fi

# Credential helper: always read GH_TOKEN from env (supports token rotation,
# avoids embedding tokens in clone URLs). Works for all github.com repos.
git config --global credential.https://github.com.helper \
  '!f() { echo "username=x-access-token"; echo "password=${GH_TOKEN}"; }; f'
git config --global credential.https://github.com.useHttpPath true

exec "$@"
