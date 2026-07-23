#!/usr/bin/env bash
# =============================================================================
#  Conquer Online — Discord AI Operating System
#  Production startup script for Pterodactyl / Legacy Bot Hosting
#
#  Usage:  bash start.sh
#  Needs:  Node.js >= 20, internet access on first run (downloads pnpm)
# =============================================================================
set -euo pipefail

# Exact pnpm version that generated pnpm-lock.yaml (lockfileVersion 9.0).
# Do NOT change this without also regenerating pnpm-lock.yaml.
REQUIRED_PNPM_VERSION="10.26.1"
REQUIRED_NODE_MAJOR=20
BOT_FILTER="@workspace/discord-bot"

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[start.sh]${NC} $*"; }
success() { echo -e "${GREEN}[start.sh]${NC} $*"; }
warn()    { echo -e "${YELLOW}[start.sh]${NC} $*"; }
die()     { echo -e "${RED}[start.sh] FATAL:${NC} $*" >&2; exit 1; }

# ── Resolve the repo root (script may be called from any working directory) ──
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_ROOT}"
info "Working directory: ${REPO_ROOT}"

# ── Node.js version check ─────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  die "Node.js is not installed. Install Node.js ${REQUIRED_NODE_MAJOR}+ and try again."
fi

NODE_MAJOR="$(node -e "process.stdout.write(process.versions.node.split('.')[0])")"
if [ "${NODE_MAJOR}" -lt "${REQUIRED_NODE_MAJOR}" ]; then
  die "Node.js ${REQUIRED_NODE_MAJOR}+ required, found ${NODE_MAJOR}. Please upgrade Node.js."
fi
success "Node.js $(node --version) ✓"

# ── pnpm version check / install ──────────────────────────────────────────────
install_pnpm() {
  info "Installing pnpm@${REQUIRED_PNPM_VERSION}..."
  if command -v corepack &>/dev/null; then
    corepack enable 2>/dev/null || true
    corepack prepare "pnpm@${REQUIRED_PNPM_VERSION}" --activate
  else
    warn "corepack not available — using npm to install pnpm"
    npm install -g "pnpm@${REQUIRED_PNPM_VERSION}"
  fi
}

if command -v pnpm &>/dev/null; then
  CURRENT_PNPM="$(pnpm --version 2>/dev/null || echo "0.0.0")"
  CURRENT_PNPM_MAJOR="$(echo "${CURRENT_PNPM}" | cut -d. -f1)"
  if [ "${CURRENT_PNPM_MAJOR}" -lt 10 ]; then
    warn "pnpm ${CURRENT_PNPM} is too old (need 10+). Upgrading to ${REQUIRED_PNPM_VERSION}..."
    install_pnpm
  else
    success "pnpm ${CURRENT_PNPM} ✓"
  fi
else
  warn "pnpm not found."
  install_pnpm
fi

# Confirm pnpm is now available
if ! command -v pnpm &>/dev/null; then
  die "pnpm installation failed. Install it manually: npm install -g pnpm@${REQUIRED_PNPM_VERSION}"
fi
success "pnpm $(pnpm --version) ready ✓"

# ── .env loading (Pterodactyl injects vars directly; .env is a local fallback) ─
if [ -f "${REPO_ROOT}/.env" ]; then
  info "Loading .env file..."
  # Read line-by-line so values with spaces (e.g. SERVER_NAME=My Server) work
  # without needing quotes in the .env file.
  while IFS= read -r line || [ -n "${line}" ]; do
    # Skip blank lines and comments
    [[ "${line}" =~ ^[[:space:]]*$ ]] && continue
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    # Strip inline comments  (e.g.  KEY=value  # comment)
    line="${line%%#*}"
    line="${line%"${line##*[^[:space:]]}"}"  # rtrim
    [ -z "${line}" ] && continue
    # export "KEY=value" handles unquoted spaces in the value correctly
    export "${line?}"
  done < "${REPO_ROOT}/.env"
  success ".env loaded ✓"
else
  info "No .env file found — expecting environment variables from the hosting panel."
fi

# ── Required variable pre-flight check ────────────────────────────────────────
MISSING=()
for VAR in DISCORD_BOT_TOKEN CHANNEL_SERVER_STATUS SERVER_NAME; do
  if [ -z "${!VAR:-}" ]; then
    MISSING+=("${VAR}")
  fi
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  die "Missing required environment variable(s): ${MISSING[*]}\n       Add them to your .env file or hosting panel, then restart."
fi
success "Required environment variables present ✓"

# ── Install dependencies ──────────────────────────────────────────────────────
info "Installing dependencies (pnpm install --frozen-lockfile)..."
pnpm install --frozen-lockfile
success "Dependencies installed ✓"

# ── Launch the Discord bot ────────────────────────────────────────────────────
info "Starting ${BOT_FILTER}..."
echo ""
exec pnpm --filter "${BOT_FILTER}" run start
