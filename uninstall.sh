#!/usr/bin/env bash
# Remove the fixdoc installation made by install.sh.
# Does NOT touch any project that ran `fixdoc init` — clean those manually:
#   git config --unset core.hooksPath
#   rm -rf .githooks fixdoc/queue fixdoc/knowledge/draft
#   (decide what to do with fixdoc/knowledge/cases and INDEX.md)

set -euo pipefail

FIXDOC_HOME="${FIXDOC_HOME:-$HOME/.fixdoc}"
BIN_DIR="${FIXDOC_BIN_DIR:-$HOME/.local/bin}"
SHIM="$BIN_DIR/fixdoc"

if [ -f "$SHIM" ]; then rm -f "$SHIM"; echo "removed $SHIM"; fi
if [ -d "$FIXDOC_HOME" ]; then rm -rf "$FIXDOC_HOME"; echo "removed $FIXDOC_HOME"; fi
echo "fixdoc uninstalled."
