#!/usr/bin/env bash
# Fixdoc installer.
#
# Usage:
#   curl -fsSL https://<host>/install.sh | bash
# Or, for local testing:
#   FIXDOC_SRC=/Users/me/work/fixdoc bash install.sh
#
# Effects:
#   - Installs fixdoc source to $FIXDOC_HOME (default: ~/.fixdoc)
#   - Creates a `fixdoc` shim in $BIN_DIR (default: ~/.local/bin)
#   - Prints PATH advice if the shim dir isn't already on PATH
#
# Requirements on the user's machine: bash, git, node 18+. Claude CLI is
# needed at runtime but not at install time.

set -euo pipefail

FIXDOC_HOME="${FIXDOC_HOME:-$HOME/.fixdoc}"
BIN_DIR="${FIXDOC_BIN_DIR:-$HOME/.local/bin}"
REPO_URL="${FIXDOC_REPO_URL:-https://github.com/your-org/fixdoc.git}"
REF="${FIXDOC_REF:-main}"
SRC_OVERRIDE="${FIXDOC_SRC:-}"

log()  { printf '[fixdoc-install] %s\n' "$*"; }
fail() { printf '[fixdoc-install] ERROR: %s\n' "$*" >&2; exit 1; }

# --- preflight ---
command -v git  >/dev/null 2>&1 || fail "git is required."
command -v node >/dev/null 2>&1 || fail "node is required (Node 18+)."
NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
[ "$NODE_MAJOR" -ge 18 ] || fail "Node 18+ required (found $(node -v))."

# --- fetch source ---
if [ -n "$SRC_OVERRIDE" ]; then
  [ -d "$SRC_OVERRIDE" ] || fail "FIXDOC_SRC does not exist: $SRC_OVERRIDE"
  log "copying from $SRC_OVERRIDE → $FIXDOC_HOME"
  rm -rf "$FIXDOC_HOME"
  mkdir -p "$FIXDOC_HOME"
  # copy only what fixdoc needs at runtime
  cp -R "$SRC_OVERRIDE/fixdoc"     "$FIXDOC_HOME/fixdoc"
  cp -R "$SRC_OVERRIDE/.githooks"  "$FIXDOC_HOME/.githooks"
  cp    "$SRC_OVERRIDE/package.json" "$FIXDOC_HOME/package.json" 2>/dev/null || true
  cp    "$SRC_OVERRIDE/README.md"  "$FIXDOC_HOME/README.md"    2>/dev/null || true
else
  log "cloning $REPO_URL@$REF → $FIXDOC_HOME"
  if [ -d "$FIXDOC_HOME/.git" ]; then
    git -C "$FIXDOC_HOME" fetch --depth=1 origin "$REF"
    git -C "$FIXDOC_HOME" reset --hard FETCH_HEAD
  else
    rm -rf "$FIXDOC_HOME"
    git clone --depth=1 --branch "$REF" "$REPO_URL" "$FIXDOC_HOME"
  fi
fi

# --- write shim ---
mkdir -p "$BIN_DIR"
SHIM="$BIN_DIR/fixdoc"
cat > "$SHIM" <<EOF
#!/usr/bin/env bash
exec node "$FIXDOC_HOME/fixdoc/bin/fixdoc.js" "\$@"
EOF
chmod +x "$SHIM"
log "shim installed: $SHIM"

# --- PATH advice ---
case ":$PATH:" in
  *":$BIN_DIR:"*)
    log "PATH already includes $BIN_DIR. Try: fixdoc help"
    ;;
  *)
    SHELL_RC=""
    case "$(basename "${SHELL:-}")" in
      zsh)  SHELL_RC="$HOME/.zshrc"  ;;
      bash) SHELL_RC="$HOME/.bashrc" ;;
    esac
    log "Add $BIN_DIR to your PATH. Example:"
    printf '\n    echo '\''export PATH="%s:$PATH"'\'' >> %s\n    source %s\n\n' \
      "$BIN_DIR" "${SHELL_RC:-<your shell rc>}" "${SHELL_RC:-<your shell rc>}"
    ;;
esac

log "Done. Verify with: fixdoc help"
log "Next: cd into a git project and run \`fixdoc init\`."
