#!/bin/sh
#
# Zeno install wrapper — served from https://zeno-agent.dev/install.sh.
#
# Forwards to the install.sh shipped at the resolved ref:
#   - default:    latest stable release tag (fallback prerelease, fallback main).
#   - --unstable: the install.sh on `main` (no CI gate; may break).
#   - --version <tag>:  install a specific release tag.
#   - --branch <name>:  install a specific branch.
#   - --pr <number>:    install a specific pull request branch.
#
# Usage:
#   curl -fsSL https://zeno-agent.dev/install.sh | sh
#   curl -fsSL https://zeno-agent.dev/install.sh | sh -s -- --unstable
#   curl -fsSL https://zeno-agent.dev/install.sh | sh -s -- --version v2026.5.7
#   curl -fsSL https://zeno-agent.dev/install.sh | sh -s -- --branch feat/foo
#   curl -fsSL https://zeno-agent.dev/install.sh | sh -s -- --pr 123
#
# Compatible with /bin/sh (POSIX) on macOS, Linux, WSL2.

set -eu

REPO="ribeirogab/zeno-agent"
UNSTABLE=0

for arg in "$@"; do
  case "$arg" in
    --unstable) UNSTABLE=1 ;;
    --branch|--pr)
      # Forwarded to the underlying install.sh; force `main` ref so we fetch
      # the wrapper-aware install.sh that knows these flags.
      UNSTABLE=1
      ;;
  esac
done

if [ "$UNSTABLE" = "1" ]; then
  REF="main"
  printf '\033[1;33m›\033[0m Zeno installer (\033[1mUNSTABLE\033[0m — main branch)\n'
else
  # Latest stable release. Falls back to most recent prerelease if no
  # stable release exists, then to main if no releases exist at all.
  REF="$(
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null \
      | grep '"tag_name"' \
      | head -1 \
      | cut -d'"' -f4 || true
  )"
  if [ -z "${REF}" ]; then
    REF="$(
      curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=1" 2>/dev/null \
        | grep '"tag_name"' \
        | head -1 \
        | cut -d'"' -f4 || true
    )"
  fi
  if [ -z "${REF}" ]; then
    REF="main"
    printf '\033[1;33m!\033[0m No releases found, falling back to main\n' >&2
  else
    printf '\033[1;33m›\033[0m Zeno installer (stable — \033[1m%s\033[0m)\n' "${REF}"
  fi
fi

# Download the underlying installer to a temp file then exec it with the
# original args. Avoids a second pipe-to-sh hop and preserves arg passing.
TMPFILE="$(mktemp -t zeno-install.XXXXXX)"
trap 'rm -f "${TMPFILE}"' EXIT INT TERM
curl -fsSL "https://raw.githubusercontent.com/${REPO}/${REF}/install.sh" -o "${TMPFILE}"
chmod +x "${TMPFILE}"
exec "${TMPFILE}" "$@"
