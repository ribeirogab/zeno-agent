#!/bin/sh
set -eu
PROFILE="${PROFILE:-default}"
ARGS=""

for arg in "$@"; do
  if [ -f "infra/docker-compose.${arg}.yml" ]; then
    PROFILE="$arg"
  else
    ARGS="${ARGS:+$ARGS }$arg"
  fi
done

COMPOSE_FILE="infra/docker-compose.${PROFILE}.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "error: profile '${PROFILE}' not found (expected ${COMPOSE_FILE})" >&2
  exit 1
fi

exec docker compose -f "$COMPOSE_FILE" --project-directory . $ARGS
