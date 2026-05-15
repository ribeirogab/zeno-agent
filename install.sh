#!/bin/sh
# zeno-agent installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ribeirogab/zeno-agent/main/install.sh | sh
#   curl -fsSL ... | sh -s -- --unstable
#   curl -fsSL ... | sh -s -- --version v2026.5.7
#   curl -fsSL ... | sh -s -- --branch feat/foo
#   curl -fsSL ... | sh -s -- --pr 123
#
# Flags (mutex): --unstable | --version <tag> | --branch <name> | --pr <number>
# Default (no flag): latest stable release → fallback prerelease → fallback main.
#
# Behavior:
#   - Hardcoded install path: ~/.zeno/zeno-agent. No ZENO_HOME override.
#   - Refuses to run if ~/.zeno/zeno-agent already exists. Use 'zeno upgrade'
#     for routine version moves, or remove the directory to reinstall.
#   - Verifies prerequisites (git, docker, node 24+, curl) and prints
#     an install URL when one is missing. pnpm is bootstrapped via corepack
#     from the cloned repo's package.json (no host pnpm needed).
#   - Detects the legacy ~/zeno-agent install and prints an explicit cleanup
#     instruction (manual; the installer never deletes operator data).
#   - Clones the repo at the resolved ref, runs pnpm install, builds @zeno/cli,
#     and symlinks ~/.local/bin/zeno -> ~/.zeno/zeno-agent/apps/cli/dist/index.js.
#   - Writes ~/.zeno/zeno-agent/.installed-from with the line `kind:value@sha`
#     so `zeno --version` and `zeno upgrade --rollback` can read the origin.
#   - Prints a PATH hint when ~/.local/bin is not on $PATH.
#   - Intentionally POSIX sh: no bash arrays, no [[ ]], no ${var,,}, no
#     process substitution. No `jq` dependency — JSON parsed via grep+sed.

set -eu

ZENO_DATA="${HOME}/.zeno"
ZENO_HOME="${ZENO_DATA}/zeno-agent"
BIN_DIR="${HOME}/.local/bin"
REPO="ribeirogab/zeno-agent"
REPO_URL="https://github.com/${REPO}.git"
API_BASE="${ZENO_INSTALL_API_BASE:-https://api.github.com}"

KIND=""
VALUE=""
DRY_PARSE=0

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

fail_mutex() {
  fail "--unstable, --version, --branch, --pr are mutually exclusive"
}

print_usage() {
  cat <<'USAGE'
zeno-agent installer

Usage:
  install.sh                      install latest stable release (fallback prerelease, fallback main)
  install.sh --unstable           install main HEAD (no CI gate; may break)
  install.sh --version <tag>      install a specific release tag
  install.sh --branch <name>      install a specific branch
  install.sh --pr <number>        install a specific pull request branch
  install.sh -h | --help          show this help
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --unstable)
      [ -n "$KIND" ] && fail_mutex
      KIND="unstable"
      ;;
    --version)
      [ -n "$KIND" ] && fail_mutex
      KIND="tag"
      shift
      [ $# -gt 0 ] || fail "--version requires a value"
      case "$1" in --*) fail "--version requires a value (got '$1')" ;; esac
      VALUE="$1"
      ;;
    --branch)
      [ -n "$KIND" ] && fail_mutex
      KIND="branch"
      shift
      [ $# -gt 0 ] || fail "--branch requires a value"
      case "$1" in --*) fail "--branch requires a value (got '$1')" ;; esac
      VALUE="$1"
      ;;
    --pr)
      [ -n "$KIND" ] && fail_mutex
      KIND="pr"
      shift
      [ $# -gt 0 ] || fail "--pr requires a value"
      case "$1" in --*) fail "--pr requires a value (got '$1')" ;; esac
      VALUE="$1"
      ;;
    --dry-parse)
      DRY_PARSE=1
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      fail "unknown flag: $1"
      ;;
  esac
  shift
done

parse_tag() {
  grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/'
}

resolve_default() {
  TAG=$(curl -fsSL "${API_BASE}/repos/${REPO}/releases/latest" 2>/dev/null | parse_tag || true)
  if [ -n "${TAG:-}" ]; then
    KIND="tag"
    VALUE="$TAG"
    return
  fi
  TAG=$(curl -fsSL "${API_BASE}/repos/${REPO}/releases?per_page=1" 2>/dev/null | parse_tag || true)
  if [ -n "${TAG:-}" ]; then
    KIND="tag"
    VALUE="$TAG"
    return
  fi
  KIND="unstable"
  VALUE=""
}

if [ -z "$KIND" ]; then
  if ! command -v curl >/dev/null 2>&1; then
    fail "curl not found. install curl: https://curl.se/"
  fi
  resolve_default
fi

if [ "$DRY_PARSE" -eq 1 ]; then
  printf 'KIND=%s\n' "$KIND"
  printf 'VALUE=%s\n' "$VALUE"
  exit 0
fi

# Validate --version tag exists before clone.
if [ "$KIND" = "tag" ] && [ -n "$VALUE" ]; then
  if ! command -v curl >/dev/null 2>&1; then
    fail "curl not found. install curl: https://curl.se/"
  fi
  STATUS=$(curl -fsSL -o /dev/null -w '%{http_code}' "${API_BASE}/repos/${REPO}/releases/tags/${VALUE}" || true)
  if [ "$STATUS" != "200" ]; then
    fail "version ${VALUE} not found"
  fi
fi

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
    fail "$1 not found. $2"
  fi
}

need git    'install git: https://git-scm.com/downloads'
need docker 'install Docker Desktop (mac/win) or Engine (linux): https://docs.docker.com/get-docker/'
need node   'install Node.js 24 LTS: https://nodejs.org/ (recommend fnm/nvm)'
need curl   'install curl: https://curl.se/'

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 24 ]; then
  fail "node 24+ required, got $(node -v)"
fi

mkdir -p "$ZENO_DATA"

case "$KIND" in
  unstable)
    printf 'cloning %s (main) into %s\n' "$REPO_URL" "$ZENO_HOME"
    git clone --depth 1 --branch main "$REPO_URL" "$ZENO_HOME"
    ;;
  tag|branch)
    printf 'cloning %s (%s %s) into %s\n' "$REPO_URL" "$KIND" "$VALUE" "$ZENO_HOME"
    git clone --depth 1 --branch "$VALUE" "$REPO_URL" "$ZENO_HOME"
    ;;
  pr)
    printf 'cloning %s (pr/%s) into %s\n' "$REPO_URL" "$VALUE" "$ZENO_HOME"
    git clone --depth 1 "$REPO_URL" "$ZENO_HOME"
    cd "$ZENO_HOME"
    git fetch --depth 1 origin "pull/${VALUE}/head:pr-${VALUE}"
    git checkout "pr-${VALUE}"
    cd - >/dev/null
    ;;
esac

SHA=$(git -C "$ZENO_HOME" rev-parse --short HEAD)
META="${ZENO_HOME}/.installed-from"
case "$KIND" in
  tag)      printf 'tag:%s@%s\n' "$VALUE" "$SHA" > "$META" ;;
  unstable) printf 'unstable:@%s\n' "$SHA"        > "$META" ;;
  branch)   printf 'branch:%s@%s\n' "$VALUE" "$SHA" > "$META" ;;
  pr)       printf 'pr:%s@%s\n' "$VALUE" "$SHA"     > "$META" ;;
esac

cd "$ZENO_HOME"

parse_pnpm_version() {
  grep '"packageManager"' package.json | sed 's/.*"pnpm@\([^"]*\)".*/\1/'
}

PNPM_VERSION="$(parse_pnpm_version)"
if [ -z "$PNPM_VERSION" ]; then
  fail 'package.json missing "packageManager" field (corepack bootstrap requires it)'
fi

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate

pnpm install --frozen-lockfile
pnpm build --filter @zeno/cli

mkdir -p "$BIN_DIR"
ln -sf "$ZENO_HOME/apps/cli/dist/index.js" "$BIN_DIR/zeno"
chmod +x "$ZENO_HOME/apps/cli/dist/index.js"

printf '\n* Cloned to %s\n' "$ZENO_HOME"
printf '* Installed CLI to %s/zeno\n' "$BIN_DIR"
printf '* Installed from: %s\n' "$(cat "$META")"

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
printf 'Docs:  https://docs.zeno-agent.dev/install\n'
