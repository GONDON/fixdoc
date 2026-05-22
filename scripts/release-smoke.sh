#!/usr/bin/env bash
# Release smoke test: install fixdoc from the working tree, init a fresh
# project in a sandbox, make a fixdoc commit, verify the queue and status.
# Exits non-zero on any failure.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "[smoke] sandbox: $TMP"

FIXDOC_SRC="$REPO_ROOT" \
FIXDOC_HOME="$TMP/home" \
FIXDOC_BIN_DIR="$TMP/bin" \
bash "$REPO_ROOT/install.sh" >/dev/null

export PATH="$TMP/bin:$PATH"

fixdoc help >/dev/null || { echo "FAIL: fixdoc help"; exit 1; }

mkdir "$TMP/proj"
cd "$TMP/proj"
git init -q
git config user.email t@t
git config user.name t

fixdoc init >/dev/null

[ -x .githooks/post-commit ]            || { echo "FAIL: post-commit not executable"; exit 1; }
[ -f fixdoc/config.yaml ]               || { echo "FAIL: config.yaml missing"; exit 1; }
[ -f fixdoc/knowledge/INDEX.md ]        || { echo "FAIL: INDEX.md missing"; exit 1; }
[ "$(git config --get core.hooksPath)" = ".githooks" ] \
                                        || { echo "FAIL: hooksPath not set"; exit 1; }

echo x > a.txt
git add a.txt
git commit -q -m "fixdoc(smoke): release smoke" -m "## test body"

[ -s fixdoc/queue/pending.jsonl ]       || { echo "FAIL: queue not written"; exit 1; }
fixdoc status | grep -q pending         || { echo "FAIL: status missing pending"; exit 1; }

# Negative trigger: fix: must NOT enqueue
echo y > b.txt
git add b.txt
git commit -q -m "fix: unrelated"
LINES=$(wc -l < fixdoc/queue/pending.jsonl)
[ "$LINES" -eq 1 ]                      || { echo "FAIL: fix: commit unexpectedly enqueued ($LINES lines)"; exit 1; }

echo "OK: release smoke passed"
