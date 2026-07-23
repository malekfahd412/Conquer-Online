# Deploying on Legacy Bot Hosting (Pterodactyl)

This guide covers deploying the **Conquer Online Discord AI Operating System** bot on any Pterodactyl-based host (Legacy Bot Hosting, Bloom, etc.) after a fresh `git clone`.

---

## What the repository contains

```
/                              ← pnpm workspace root
├── artifacts/
│   └── discord-bot/          ← THE BOT (only this needs to run)
│       └── src/index.ts      ← entry point (TypeScript, runs via tsx)
├── data/                     ← persistent JSON store (tickets, panels, etc.)
├── pnpm-lock.yaml            ← frozen dependency lockfile (commit this!)
├── start.sh                  ← production entrypoint — run this
├── .env.example              ← copy to .env and fill in secrets
└── DEPLOYMENT.md             ← this file
```

> **Architecture note:** `artifacts/api-server` and `artifacts/mockup-sandbox` are Replit-only development tools. They are part of the monorepo but are **not started by `start.sh`** and are not required for the Discord bot.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js     | **≥ 20** | `.node-version` file declares this; many Pterodactyl eggs read it automatically |
| pnpm        | **≥ 10** | `start.sh` installs it automatically if missing or outdated |
| Build tools | gcc, make, python3 | Needed to compile `@discordjs/opus` (standard in Pterodactyl Node.js eggs) |

---

## Step 1 — Create a Pterodactyl Server

1. In Legacy Bot Hosting, create a new server using the **Generic: Node.js** egg (or any Node.js egg).
2. Set the **Docker image** to one that includes Node.js 20:
   ```
   ghcr.io/pterodactyl/yolks:nodejs_20
   ```
3. Set the **Startup Command** to:
   ```
   bash start.sh
   ```

---

## Step 2 — Clone the Repository

In the panel's **File Manager → Git Clone** tool (or SSH into the server):

```bash
git clone https://github.com/<your-username>/<your-repo>.git .
```

The `.` clones into the current server root directory. After cloning, your server root should look like:

```
start.sh   package.json   pnpm-lock.yaml   artifacts/   data/   ...
```

---

## Step 3 — Set Environment Variables

You have two options. Option A is recommended for Pterodactyl.

### Option A — Panel Startup Variables (recommended)

Add variables under **Startup → Variables** in the Pterodactyl panel. They are injected directly into the process environment — no file needed.

### Option B — `.env` file

```bash
cp .env.example .env
# Edit .env in the panel's file manager
```

> **Note:** The `start.sh` `.env` parser handles values with spaces correctly without requiring quotes (e.g. `SERVER_NAME=Mufasa Conquer` works as-is). However, values that look like shell special characters should be quoted to be safe.

---

## Environment Variables Reference

### Required — bot will not start without these

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Bot token from [Discord Developer Portal](https://discord.com/developers/applications) → Bot → Token |
| `CHANNEL_SERVER_STATUS` | Channel ID where the live status embed is posted *(right-click channel → Copy Channel ID with Developer Mode on)* |
| `SERVER_NAME` | Your game/community server name (e.g. `Mufasa Conquer`) |

### AI Provider — at least one required for AI features

| Variable | Used when | Description |
|----------|-----------|-------------|
| `GEMINI_API_KEY` | `AI_PROVIDER=gemini` (default) | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `OPENAI_API_KEY` | `AI_PROVIDER=openai` or voice STT/TTS | [OpenAI](https://platform.openai.com/api-keys) |
| `OPENROUTER_API_KEY` | `AI_PROVIDER=openrouter` | [OpenRouter](https://openrouter.ai/keys) |
| `GROQ_API_KEY` | `AI_PROVIDER=groq` | [Groq](https://console.groq.com/keys) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_PROVIDER` | `gemini` | Which AI backend: `gemini`, `openai`, `openrouter`, `groq` |
| `DATA_SOURCE` | `mock` | Game data: `mock` (placeholder), `mssql`, or `api` |
| `MSSQL_SERVER` / `MSSQL_DATABASE` / `MSSQL_USER` / `MSSQL_PASSWORD` | — | Only when `DATA_SOURCE=mssql` |
| `MSSQL_PORT` | `1433` | MSSQL port override |
| `GAME_SERVER_API_URL` | — | Only when `DATA_SOURCE=api` |
| `SERVER_NAME` | required | Game/community name shown in the embed |
| `SERVER_LOGO_URL` | — | URL to your server logo image |
| `SERVER_WEBSITE` / `FACEBOOK_URL` / `DISCORD_INVITE` / etc. | — | Social buttons on the status embed |
| `ROLE_ADMIN` | — | Role ID that can run AI admin commands |
| `CHANNEL_AI_LOG` | — | Channel for AI execution logs |
| `CHANNEL_AI_CHAT` | — | Channel for public AI chat |
| `AI_PLAN_PREVIEW` | `true` | Show AI action plan before executing |
| `SUPPORT_STAFF_ROLE_ID` | — | Role whose members see Support Inbox conversations |
| `CHANNEL_SUPPORT_INBOX` | auto | Override the auto-created `#📥-support-inbox` channel |
| `UPDATE_INTERVAL_MS` | `3000` | Status embed refresh rate (minimum 3000 ms) |

See `.env.example` for the full list with inline descriptions.

---

## Step 4 — Start the Server

Click **Start** in the Pterodactyl panel. `start.sh` runs automatically and:

1. Verifies **Node.js ≥ 20** is available
2. Checks **pnpm** is installed and ≥ 10; installs/upgrades to `10.26.1` if not
3. Loads `.env` if present (no-op otherwise — panel variables are already in the environment)
4. Pre-flight checks that all three required variables are set
5. Runs `pnpm install --frozen-lockfile` to install all 639 packages from the lockfile
6. Executes the Discord bot via `pnpm --filter @workspace/discord-bot run start`

### Expected healthy startup output

```
[start.sh] Working directory: /home/container
[start.sh] Node.js v20.x.x ✓
[start.sh] pnpm 10.26.1 ✓
[start.sh] pnpm 10.26.1 ready ✓
[start.sh] No .env file found — expecting environment variables from the hosting panel.
[start.sh] Required environment variables present ✓
[start.sh] Installing dependencies (pnpm install --frozen-lockfile)...
...
Done in 10s using pnpm v10.26.1
[start.sh] Dependencies installed ✓
[start.sh] Starting @workspace/discord-bot...

> @workspace/discord-bot@1.0.0 start
> tsx src/index.ts

[INFO] ========================================
[INFO]   Conquer Online Live Server Status Bot
[INFO] ========================================
[SUCCESS] Configuration loaded — Server: Mufasa Conquer
[SUCCESS] Status channel found: #🟢┇𝐒𝐞𝐫𝐯𝐞𝐫᲼𝐒𝐭𝐚𝐭𝐮𝐬᲼📡
[SUCCESS] [TICKETS] Ticket System Pro online — 13 engines wired
[SUCCESS] Registered 33 commands in guild ...
[SUCCESS] Bot is running — starting update loop
```

---

## Updating the Bot

1. Stop the server in the panel.
2. Pull the latest code via Git:
   ```bash
   git pull origin main
   ```
3. Start the server — `start.sh` re-runs `pnpm install --frozen-lockfile` on every startup, so updated dependencies are always installed automatically.

---

## Troubleshooting

### `[FATAL] Missing required environment variable: DISCORD_BOT_TOKEN`
The variable is not set. Add it under **Startup → Variables** in the panel, or in your `.env` file.

### `tsx: command not found` / `Cannot find module`
`node_modules` was not installed. Make sure the **startup command is `bash start.sh`**, not `node src/index.ts` or anything else. `start.sh` runs `pnpm install` before launching the bot.

### `ERR_PNPM_OUTDATED_LOCKFILE`
The `pnpm-lock.yaml` is out of sync with a `package.json`. This is a developer issue — run `pnpm install` locally (without `--frozen-lockfile`), commit the updated lockfile, then redeploy.

### `gyp ERR!` / native module build failure (`@discordjs/opus`)
Build tools are missing from the container. Use the standard `ghcr.io/pterodactyl/yolks:nodejs_20` Docker image which includes `gcc`, `make`, and `python3`.

### `An invalid token was provided`
`DISCORD_BOT_TOKEN` is set but wrong. Re-copy it from the Discord Developer Portal → Bot → Token (use Reset Token to get a fresh one if needed).

### Bot online but shows "Waiting for Server Connection"
`DATA_SOURCE` is `mock` (the default). This is expected if you don't have a game server database. Set `DATA_SOURCE=mssql` + `MSSQL_*` variables, or `DATA_SOURCE=api` + `GAME_SERVER_API_URL` to show live data.

### pnpm corepack fails / needs sudo
This happens when Node.js was installed system-wide and corepack needs elevated permissions. The fallback path in `start.sh` uses `npm install -g pnpm@10.26.1` instead. If that also fails, install pnpm manually in the container before starting.

---

## Production Audit Results

The following checks were verified against a completely clean directory (no `node_modules`):

| Check | Result |
|-------|--------|
| `start.sh` is executable (`chmod +x`) | ✅ |
| `start.sh` bash syntax valid | ✅ |
| `start.sh` handles any working directory | ✅ via `BASH_SOURCE` path resolution |
| `pnpm-lock.yaml` committed | ✅ 7106 lines, lockfileVersion 9.0 |
| All `data/` JSON files committed and valid | ✅ 23 files |
| `@napi-rs/canvas-linux-x64-gnu` prebuilt binary in lockfile | ✅ no compile needed |
| `@esbuild/linux-x64` in lockfile | ✅ |
| `@rollup/rollup-linux-x64-gnu` in lockfile | ✅ |
| `.env` parser handles unquoted values with spaces | ✅ fixed (line-by-line export) |
| `packageManager` field set | ✅ `pnpm@10.26.1` |
| `engines` field set | ✅ `node >=20` in root and discord-bot |
| `.node-version` file | ✅ `20` |
| `.env` in `.gitignore` | ✅ |
| pnpm install (fresh, no cache) | ✅ 639 packages in ~10s |
| Bot process starts and reaches Discord login | ✅ confirmed with audit token |
