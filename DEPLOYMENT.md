# Deploying on Legacy Bot Hosting (Pterodactyl)

This guide walks you through deploying the **Conquer Online Discord AI Operating System** bot on any Pterodactyl-based host (Legacy Bot Hosting, Bloom, etc.) from a fresh GitHub clone.

---

## Prerequisites (on the hosting panel)

| Requirement | Version |
|-------------|---------|
| Node.js     | **20 or later** (LTS recommended) |
| pnpm        | **10+** (auto-installed by `start.sh` if missing) |
| Build tools | `gcc`, `make`, `python3` — needed to compile `@discordjs/opus` (usually pre-installed in Node.js eggs) |

---

## Step 1 — Create a Pterodactyl Server

1. In your hosting panel, create a new server using the **Node.js** egg (generic JS egg works too).
2. Set the **Startup Command** to:
   ```
   bash start.sh
   ```
3. Set the **Docker Image** (if prompted) to one that includes **Node.js 20** — e.g. `ghcr.io/pterodactyl/yolks:nodejs_20`.

---

## Step 2 — Link your GitHub Repository

In the panel's **Git / File Manager** section:

```
Repository URL: https://github.com/<your-username>/<your-repo>.git
Branch:         main   (or whichever branch you deploy from)
```

After cloning, the file tree should look like this at the server root:

```
├── artifacts/
│   └── discord-bot/     ← the bot lives here
├── lib/
├── data/
├── start.sh             ← entrypoint
├── .env.example         ← copy to .env
├── package.json
└── pnpm-workspace.yaml
```

---

## Step 3 — Set Environment Variables

You have two options:

### Option A — Pterodactyl Startup Variables (recommended)

Add each variable in the panel under **Startup → Variables**. The bot reads them directly from the process environment.

### Option B — `.env` file

Copy `.env.example` to `.env` in the server root and fill in your values via the panel's file manager:

```bash
cp .env.example .env
# then edit .env with your values
```

### Required Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Your bot token from [Discord Developer Portal](https://discord.com/developers/applications) → Bot → Token |
| `CHANNEL_SERVER_STATUS` | Channel ID where the live status embed is posted *(right-click channel → Copy Channel ID)* |
| `SERVER_NAME` | Your server/community name shown in the embed |

### AI Provider (at least one required for AI features)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) — used when `AI_PROVIDER=gemini` (default) |
| `OPENAI_API_KEY` | [OpenAI](https://platform.openai.com/api-keys) — used when `AI_PROVIDER=openai` and for voice STT/TTS |
| `OPENROUTER_API_KEY` | [OpenRouter](https://openrouter.ai/keys) — used when `AI_PROVIDER=openrouter` |
| `GROQ_API_KEY` | [Groq](https://console.groq.com/keys) — used when `AI_PROVIDER=groq` |

### Optional Variables

See `.env.example` for the full list with descriptions. Key optional ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `gemini` | Which AI to use: `gemini`, `openai`, `openrouter`, `groq` |
| `DATA_SOURCE` | `mock` | Game data source: `mock`, `mssql`, or `api` |
| `MSSQL_SERVER` / `MSSQL_DATABASE` / `MSSQL_USER` / `MSSQL_PASSWORD` | — | Required only when `DATA_SOURCE=mssql` |
| `GAME_SERVER_API_URL` | — | Required only when `DATA_SOURCE=api` |
| `ROLE_ADMIN` | — | Role ID that can use AI admin commands |
| `CHANNEL_AI_LOG` | — | Channel ID for AI execution logs |
| `CHANNEL_AI_CHAT` | — | Channel ID for public AI chat |

---

## Step 4 — Start the Server

Click **Start** in the Pterodactyl panel. The `start.sh` script will:

1. Verify Node.js 20+ is available
2. Auto-install `pnpm` if missing
3. Load `.env` (if present)
4. Check that required environment variables are set
5. Run `pnpm install --frozen-lockfile` to install all dependencies
6. Launch the Discord bot with `pnpm --filter @workspace/discord-bot run start`

**Expected console output on a healthy start:**

```
[start.sh] Node.js v20.x.x detected.
[start.sh] pnpm 10.x.x detected.
[start.sh] Installing dependencies (pnpm install --frozen-lockfile)...
[start.sh] Dependencies installed.
[start.sh] Starting @workspace/discord-bot...

========================================
  Conquer Online Live Server Status Bot
========================================
[INFO]  Loading configuration...
[SUCCESS] Configuration loaded — Server: Mufasa Conquer
[SUCCESS] Status channel found: #🟢┇𝐒𝐞𝐫𝐯𝐞𝐫᲼𝐒𝐭𝐚𝐭𝐮𝐬᲼📡
[SUCCESS] [TICKETS] Ticket System Pro online — 13 engines wired
[SUCCESS] Registered 33 commands in guild ...
[SUCCESS] Bot is running — starting update loop
```

---

## Updating the Bot

To pull the latest changes from GitHub:

1. Stop the server in the panel.
2. Use the panel's Git manager to **pull** the latest commits.
3. Start the server — `start.sh` re-runs `pnpm install` automatically, so new dependencies are installed on every start.

---

## Troubleshooting

### `tsx: command not found`
`node_modules` wasn't installed. Make sure `start.sh` is the startup command, **not** `node src/index.ts` directly. `start.sh` runs `pnpm install` before starting the bot.

### `[FATAL] Missing required environment variable: DISCORD_BOT_TOKEN`
The environment variable is not set. Add it in the panel's Startup Variables or in your `.env` file.

### `gyp ERR!` / native module build failure
`@discordjs/opus` compiles from source and needs build tools. Make sure your Pterodactyl egg/Docker image includes `gcc`, `make`, and `python3`. The standard `ghcr.io/pterodactyl/yolks:nodejs_20` image includes these.

### `ERR_PNPM_OUTDATED_LOCKFILE`
The lockfile is out of sync with package.json changes. Run `pnpm install` (without `--frozen-lockfile`) locally, commit the updated `pnpm-lock.yaml`, and re-deploy.

### Bot is online but shows "Waiting for Server Connection"
`DATA_SOURCE` is set to `mock` (or not set). This is normal if you don't have a game server database/API. Set `DATA_SOURCE=mssql` or `DATA_SOURCE=api` and configure the corresponding variables to show real data.

---

## Architecture Reference

```
/                            ← pnpm workspace root
├── artifacts/
│   ├── discord-bot/         ← THE BOT (this is what runs)
│   │   └── src/index.ts     ← entry point
│   ├── api-server/          ← optional REST API (not needed for the bot)
│   └── mockup-sandbox/      ← Replit dev-only UI (not needed for the bot)
├── lib/                     ← shared TypeScript libraries
├── data/                    ← persistent JSON data (tickets, verification, etc.)
├── start.sh                 ← production entrypoint
├── .env.example             ← environment variable template
└── DEPLOYMENT.md            ← this file
```

The bot uses **tsx** (TypeScript execute) to run TypeScript directly — no separate compile step is required. All features (Ticket System Pro, AI Control Center, Support Inbox, Voice AI, Staff Management, Welcome/Verification) start automatically.
