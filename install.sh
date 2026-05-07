#!/bin/sh
# zeno-agent installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ribeirogab/zeno-agent/main/install.sh | sh
#
# Behavior:
#   - Hardcoded install path: ~/.zeno/zeno-agent. No ZENO_HOME override.
#   - Refuses to run if ~/.zeno/zeno-agent already exists. Use 'zeno upgrade'
#     for routine version moves, or remove the directory to reinstall.
#   - Verifies prerequisites (git, docker, node 24+, pnpm 10+) and prints an
#     install URL when one is missing.
#   - Detects the legacy ~/zeno-agent install and prints an explicit cleanup
#     instruction (manual; the installer never deletes operator data).
#   - Clones the repo, runs pnpm install, builds @zeno/cli, and symlinks
#     ~/.local/bin/zeno -> ~/.zeno/zeno-agent/apps/cli/dist/index.js.
#   - Prints a PATH hint when ~/.local/bin is not on $PATH.
#   - Intentionally POSIX sh: no bash arrays, no [[ ]], no ${var,,}, no
#     process substitution.

set -eu

ZENO_DATA="$HOME/.zeno"
ZENO_HOME="$ZENO_DATA/zeno-agent"
BIN_DIR="$HOME/.local/bin"
REPO_URL="https://github.com/ribeirogab/zeno-agent.git"
GIT_REF="main"

if [ -e "$ZENO_HOME" ]; then
  printf 'error: %s already exists.\n' "$ZENO_HOME" >&2
  printf '       to update, run: zeno upgrade\n' >&2
  printf '       to reinstall, remove the directory first: rm -rf %s\n' "$ZENO_HOME" >&2
  exit 1
fi

if [ -e "$HOME/zeno-agent" ]; then
  printf '\nnote: legacy install detected at %s\n' "$HOME/zeno-agent" >&2
  printf '      this is the pre-multi-profile-cli location and is no longer used.\n' >&2
  printf '      back up any work in ~/zeno-agent/profiles/* (zeno.db lives in docker volumes,\n' >&2
  printf '      not in the repo), then remove the legacy install:\n' >&2
  printf '        rm -rf %s\n\n' "$HOME/zeno-agent" >&2
fi

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'error: %s not found.\n' "$1" >&2
    printf '       %s\n' "$2" >&2
    exit 1
  fi
}

need git    'install git: https://git-scm.com/downloads'
need docker 'install Docker Desktop (mac/win) or Engine (linux): https://docs.docker.com/get-docker/'
need node   'install Node.js 24 LTS: https://nodejs.org/ (recommend fnm/nvm)'
need pnpm   'install pnpm 10: https://pnpm.io/installation'

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 24 ]; then
  printf 'error: node 24+ required, got %s\n' "$(node -v)" >&2
  exit 1
fi

mkdir -p "$ZENO_DATA"

printf 'cloning %s (ref %s) into %s\n' "$REPO_URL" "$GIT_REF" "$ZENO_HOME"
git clone --depth 1 --branch "$GIT_REF" "$REPO_URL" "$ZENO_HOME"

cd "$ZENO_HOME"
pnpm install --frozen-lockfile
pnpm build --filter @zeno/cli

mkdir -p "$BIN_DIR"
ln -sf "$ZENO_HOME/apps/cli/dist/index.js" "$BIN_DIR/zeno"
chmod +x "$ZENO_HOME/apps/cli/dist/index.js"

printf '\n* Cloned to %s\n' "$ZENO_HOME"
printf '* Installed CLI to %s/zeno\n' "$BIN_DIR"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    printf '\n  %s not in PATH.\n' "$BIN_DIR"
    case "${SHELL##*/}" in
      zsh)  RC="$HOME/.zshrc" ;;
      bash) RC="$HOME/.bashrc" ;;
      *)    RC="your shell rc" ;;
    esac
    printf '  add to %s:\n' "$RC"
    # The single quotes here are deliberate: we want the literal
    # "$HOME" / "$PATH" tokens printed so the operator can paste them.
    # shellcheck disable=SC2016
    printf '    export PATH="$HOME/.local/bin:$PATH"\n'
    ;;
esac

printf '\nNext:  zeno profile create <profile>\n'
printf '       zeno start <profile>\n\n'
printf 'Docs:  https://github.com/ribeirogab/zeno-agent#readme\n'
