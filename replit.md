# Conquer Online Live Server Status Bot

A Discord bot that displays a live game server status embed in a designated channel, updating every 30 seconds. Built for a Conquer Online private server.

## Run & Operate

- **Discord Bot workflow** — starts automatically; runs `pnpm --filter @workspace/discord-bot run dev`
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000, optional REST data source)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Required Secrets

| Secret | Description |
|--------|-------------|
| `DISCORD_BOT_TOKEN` | Bot token from Discord Developer Portal → Bot → Token |
| `CHANNEL_SERVER_STATUS` | Channel ID where the status embed is posted |

## Optional Environment Variables (shared)

| Variable | Description |
|----------|-------------|
| `SERVER_NAME` | Display name of the game server |
| `DATA_SOURCE` | `mssql`, `api`, or `mock` (default: `mock`) |
| `MSSQL_SERVER`, `MSSQL_PORT`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD` | MSSQL credentials (required when `DATA_SOURCE=mssql`) |
| `GAME_SERVER_API_URL` | REST API base URL (required when `DATA_SOURCE=api`) |
| `SERVER_LOGO_URL` | URL for the server logo shown in the embed |
| `SERVER_WEBSITE`, `FACEBOOK_URL`, `WHATSAPP_URL`, `DISCORD_INVITE`, `INSTAGRAM_URL`, `YOUTUBE_URL`, `TIKTOK_URL` | Social link buttons shown below the embed |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Discord: discord.js v14
- DB (optional): MSSQL via `mssql` package
- AI module: Google Gemini (`@google/genai`)
- Build: tsx (dev), esbuild (prod)

## Where things live

- `artifacts/discord-bot/src/` — all bot source code
  - `config/config.ts` — env var loading and validation (single source of truth)
  - `discord/` — client, message manager, embed builder, button builder, slash commands
  - `providers/` — data source abstraction (MSSQL, API, mock)
  - `repositories/` — ServerStatusRepository
  - `services/` — ServerStatusService
  - `ai/` — AI Control Center (Gemini-powered)

## Architecture decisions

- Provider pattern: switching data sources (`DATA_SOURCE` env var) requires no code changes — only config
- Bot edits a single status message (never duplicates); message ID is recovered on restart by scanning channel history
- Without a real data source, bot stays online and shows "Waiting for Server Connection" — never crashes

## Product

The bot posts one embed to a Discord channel showing live Conquer Online server stats (players online, peak, uptime, active events, next events) with social link buttons below. The embed updates every 30 seconds in place.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- If the Discord bot token is reset in the Developer Portal, the old token immediately becomes invalid — update `DISCORD_BOT_TOKEN` secret and restart the workflow
- `DATA_SOURCE` defaults to `mock` if unset or invalid — the bot won't show real data until MSSQL credentials or an API URL are configured

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
