#!/bin/sh
#
# Zeno install wrapper — served from https://zeno-agent.dev/install.sh.
#
# Forwards to the install.sh shipped at the resolved ref:
#   - default: latest GitHub release tag (currently all releases are
#     pre-releases; the latest one wins regardless).
#   - --beta: the install.sh on `main` (cutting edge, may be broken).
#
# Usage:
#   curl -fsSL https://zeno-agent.dev/install.sh | sh
#   curl -fsSL https://zeno-agent.dev/install.sh | sh -s -- --beta
#
# Compatible with /bin/sh (POSIX) on macOS, Linux, WSL2.

set -eu

REPO="ribeirogab/zeno-agent"
BETA=0

for arg in "$@"; do
  case "$arg" in
    --beta) BETA=1 ;;
  esac
done

if [ "$BETA" = "1" ]; then
  REF="main"
  printf '\033[1;33m›\033[0m Zeno installer (\033[1mBETA\033[0m — main branch)\n'
else
  # Most recent release, including pre-releases. We don't filter
  # because today only pre-releases exist for this project.
  REF="$(
    curl -fsSL "https://api.github.com/repos/${REPO}/releases" \
      | grep '"tag_name"' \
      | head -1 \
      | cut -d'"' -f4
  )"
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
