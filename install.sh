#!/usr/bin/env sh
#
# Mayar CLI installer
# https://github.com/mayarid/mayar-cli
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/mayarid/mayar-cli/main/install.sh | sh
#
# Tunables (set via env):
#   MAYAR_VERSION       Version to install (default: latest from npm)
#   MAYAR_INSTALL_DIR   Where to extract the package (default: ~/.local/share/mayar)
#   MAYAR_BIN_DIR       Where to symlink the binary  (default: ~/.local/bin)
#
# Requirements: node >= 18, curl, tar
#
set -eu

VERSION="${MAYAR_VERSION:-latest}"
INSTALL_DIR="${MAYAR_INSTALL_DIR:-$HOME/.local/share/mayar}"
BIN_DIR="${MAYAR_BIN_DIR:-$HOME/.local/bin}"

# --- output helpers ---------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_DIM='\033[2m'; C_BOLD='\033[1m'; C_GREEN='\033[32m'; C_RED='\033[31m'; C_RST='\033[0m'
else
  C_DIM=''; C_BOLD=''; C_GREEN=''; C_RED=''; C_RST=''
fi
info()  { printf "%b→%b %s\n" "$C_DIM" "$C_RST" "$*"; }
ok()    { printf "%b✓%b %s\n" "$C_GREEN" "$C_RST" "$*"; }
fail()  { printf "%b✗%b %s\n" "$C_RED" "$C_RST" "$*" >&2; exit 1; }

# --- preflight --------------------------------------------------------------
command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v tar  >/dev/null 2>&1 || fail "tar is required."
command -v node >/dev/null 2>&1 || fail "Node.js >= 18 is required. Install from https://nodejs.org and re-run."

NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js >= 18 is required (you have $(node -v)). Upgrade and re-run."
fi

# --- resolve version --------------------------------------------------------
if [ "$VERSION" = "latest" ]; then
  info "Resolving latest version from npm registry…"
  VERSION=$(curl -fsSL https://registry.npmjs.org/mayar/latest \
    | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>process.stdout.write(JSON.parse(s).version))' 2>/dev/null || echo "")
  [ -n "$VERSION" ] || fail "Could not resolve latest version from registry.npmjs.org."
fi
TARBALL="https://registry.npmjs.org/mayar/-/mayar-${VERSION}.tgz"

# --- download + extract -----------------------------------------------------
TMP=$(mktemp -d -t mayar-install.XXXXXX)
trap 'rm -rf "$TMP"' EXIT INT TERM

info "Downloading mayar@${VERSION}"
curl -fsSL "$TARBALL" -o "$TMP/mayar.tgz" || fail "Download failed: $TARBALL"

info "Extracting to ${INSTALL_DIR}"
tar -xzf "$TMP/mayar.tgz" -C "$TMP"
[ -d "$TMP/package" ] || fail "Unexpected tarball layout — package/ not found."

mkdir -p "$INSTALL_DIR" "$BIN_DIR"
# Clean previous install (keep dir, replace contents)
rm -rf "$INSTALL_DIR"/bin "$INSTALL_DIR"/src "$INSTALL_DIR"/package.json "$INSTALL_DIR"/README.md "$INSTALL_DIR"/LICENSE 2>/dev/null || true
cp -R "$TMP/package/." "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/bin/mayar.js"

info "Installing dependencies…"
(cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund)

# --- symlink ----------------------------------------------------------------
ln -sf "$INSTALL_DIR/bin/mayar.js" "$BIN_DIR/mayar"

# --- finish -----------------------------------------------------------------
ok "Installed ${C_BOLD}mayar@${VERSION}${C_RST} → ${BIN_DIR}/mayar"

# PATH hint
case ":$PATH:" in
  *":$BIN_DIR:"*)
    printf "  Run: %bmayar --help%b\n" "$C_BOLD" "$C_RST"
    ;;
  *)
    printf "\n%b!%b %s is not on your PATH. Add this to your shell profile:\n" "$C_BOLD" "$C_RST" "$BIN_DIR"
    printf "    %bexport PATH=\"%s:\$PATH\"%b\n" "$C_BOLD" "$BIN_DIR" "$C_RST"
    printf "  Then: %bmayar --help%b\n" "$C_BOLD" "$C_RST"
    ;;
esac
