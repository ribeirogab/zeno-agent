#!/usr/bin/env bash
# Run find-candidates.sh against the bundled fixtures and diff vs expected JSON.
set -euo pipefail

cd "$(dirname "$0")/fixtures"

actual=$(bash ../../scripts/find-candidates.sh)
expected=$(cat ../expected-output.json)

norm() { jq -S 'sort_by(.source, .target)' <<< "$1"; }

if diff <(norm "$actual") <(norm "$expected") > /dev/null; then
  echo "PASS"
  exit 0
else
  echo "FAIL"
  echo "--- expected ---"
  norm "$expected"
  echo "--- actual ---"
  norm "$actual"
  exit 1
fi
