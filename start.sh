#!/usr/bin/env bash
# =============================================================================
#  Conquer Online — Discord AI Operating System
#  Production startup script for Pterodactyl / Legacy Bot Hosting
# =============================================================================
set -euo pipefail

BOT_FILTER="@workspace/discord-bot"
REQUIRED_NODE_MAJOR=20

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[start.sh]${NC} $*"; }
success() { echo -e "${GREEN}[start.sh]${NC} $*"; }
warn()    { echo -e "${YELLOW}[start.sh]${NC} $*"; }
die()     { echo -e "${RED}[start.sh] FATAL:${NC} $*" >&2; exit 1; }

# ── Node.js version check ─────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  die "Node.js is not installed. Install Node.js ${REQUIRED_NODE_MAJOR}+ and try again."
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "${NODE_MAJOR}" -lt "${REQUIRED_NODE_MAJOR}" ]; then
  die "Node.js ${REQUIRED_NODE_MAJOR}+ required, found ${NODE_MAJOR}. Please upgrade."
fi
success "Node.js $(node --version) detected."

# ── pnpm availability ─────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found — attempting to enable via corepack..."
  if command -v corepack &>/dev/null; then
    corepack enable
    corepack prepare pnpm@10 --activate
  else
    warn "corepack not available — falling back to npm install -g pnpm"
    npm install -g pnpm@10
  fi
fi
success "pnpm $(pnpm --version) detected."

# ── .env loading (optional — Pterodactyl injects vars directly into the env) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/.env" ]; then
  info "Loading .env file..."
  # Export non-comment, non-blank lines from .env without overriding already-set vars
  set -o allexport
  # shellcheck disable=SC1090
  source "${SCRIPT_DIR}/.env"
  set +o allexport
  success ".env loaded."
else
  info "No .env file found — using environment variables from the hosting panel."
fi

# ── Required variable pre-flight check ────────────────────────────────────────
MISSING=()
for VAR in DISCORD_BOT_TOKEN CHANNEL_SERVER_STATUS SERVER_NAME; do
  if [ -z "${!VAR:-}" ]; then
    MISSING+=("$VAR")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  die "Missing required environment variable(s): ${MISSING[*]}\n       Set them in your .env file or hosting panel and restart."
fi
success "Required environment variables present."

# ── Install dependencies ──────────────────────────────────────────────────────
info "Installing dependencies (pnpm install --frozen-lockfile)..."
pnpm install --frozen-lockfile
success "Dependencies installed."

# ── Start the Discord bot ─────────────────────────────────────────────────────
info "Starting ${BOT_FILTER}..."
echo ""
exec pnpm --filter "${BOT_FILTER}" run start
