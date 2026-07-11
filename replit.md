# Conquer Online — AI Discord Operating System

## Status
Running on Replit (re-imported and re-set-up again on July 11, 2026 — `node_modules` was missing after import and secrets were lost again; dependencies were reinstalled via `pnpm install` and `DISCORD_BOT_TOKEN`/`GEMINI_API_KEY` were re-requested from the user and confirmed working, bot logged in and Ticket System Pro came online cleanly). AI provider = gemini. Shared env var `CHANNEL_SERVER_STATUS` (baked into `.replit`). `DATA_SOURCE` is unset, so live server status shows "Waiting for Server Connection" (mock/mssql/api not wired). Voice STT/TTS (`OPENAI_API_KEY` or other providers) not configured — voice AI features are inactive but text/slash AI commands work. Confirmed working: bot logs in, registers 9 guild commands, finds the status channel, and the Ticket System Pro (11 engines) comes online. The `artifacts/api-server` and `artifacts/mockup-sandbox` workflows also run (auto-added by the platform); they are auxiliary to the Discord bot and not required for it to function.

Ticket Panel Designer: each ticket button and select-menu option now has its own optional "Category ID" field (editable from the same edit modal as label/style/emoji), so different ticket types can open in different Discord categories. Falls back to the panel's Open Category when left blank.

Note: after each fresh import, `pnpm install` must be run manually before the Discord Bot workflow will start (node_modules is not preserved across imports), and secrets need to be re-added since they are not carried over either.


A Discord bot that serves as a live server status dashboard **and** an AI-powered Discord Operating System (DOS). Admins can control the entire Discord server through natural language commands.

## Run & Operate

- **Discord Bot workflow** — starts automatically; runs `pnpm --filter @workspace/discord-bot run dev`
- `pnpm --filter @workspace/api-server run dev` — run the optional REST API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Required Secrets

| Secret | Description |
|--------|-------------|
| `DISCORD_BOT_TOKEN` | Bot token from Discord Developer Portal → Bot → Token |
| `CHANNEL_SERVER_STATUS` | Channel ID where the live status embed is posted |

## AI Provider Secrets (at least one required for AI features)

| Secret | Description |
|--------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key (default provider) |
| `OPENAI_API_KEY` | OpenAI API key (set `AI_PROVIDER=openai`) |
| `OPENROUTER_API_KEY` | OpenRouter API key (set `AI_PROVIDER=openrouter`) |
| `GROQ_API_KEY` | Groq API key (set `AI_PROVIDER=groq`) |

## Environment Variables (shared)

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_NAME` | required | Display name of the game server |
| `AI_PROVIDER` | `gemini` | AI provider: `gemini`, `openai`, `openrouter`, `groq` |
| `AI_MODEL` | provider default | Override model name (e.g. `gpt-4o`, `gemini-2.5-flash`) |
| `AI_PLAN_PREVIEW` | `true` | Show Execute/Cancel embed before running tools |
| `AI_REFLECTION` | `false` | Post-execution improvement suggestions |
| `AI_OBSERVER` | `true` | Monitor guild events and log changes |
| `ROLE_ADMIN` | — | Discord role name required to use AI commands |
| `CHANNEL_AI_LOG` | — | Channel ID where AI execution logs are posted |
| `CHANNEL_AI_CHAT` | — | Channel ID where bot responds to all messages (not just mentions) |
| `DATA_SOURCE` | `mock` | `mssql`, `api`, or `mock` for live server status data |
| `MSSQL_SERVER`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD` | — | MSSQL credentials (when `DATA_SOURCE=mssql`) |
| `GAME_SERVER_API_URL` | — | REST API URL (when `DATA_SOURCE=api`) |
| `SERVER_WEBSITE`, `FACEBOOK_URL`, `WHATSAPP_URL`, `DISCORD_INVITE`, `INSTAGRAM_URL`, `YOUTUBE_URL`, `TIKTOK_URL` | — | Social link buttons below the status embed |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/ai <prompt>` | Send a natural language command to the AI |
| `/forget` | Clear your conversation memory |
| `/memory` | Show current AI memory and context |
| `/preferences` | Show your stored preferences |
| `/resetpreferences` | Reset long-term preferences |
| `/workspace start <name>` | Start a named, resumable workspace |
| `/workspace resume <name>` | Resume a previous workspace |
| `/workspace end` | End the current workspace |
| `/workspace list` | List all your workspaces |
| `/workspace delete <name>` | Delete a workspace |
| `/voice join` | Join your current voice channel and start listening |
| `/voice leave` | Leave the voice channel |
| `/voice status` | Show voice session status |
| `/voice personality <type>` | Change voice personality (friendly/professional/gaming/funny/assistant) |

## Voice AI

The bot supports real-time voice conversations similar to Gemini Live.

**How it works:**
1. Admin runs `/voice join` — bot joins your voice channel
2. Say **"Hey Mufasa"** or **"Mufasa"** to wake it up
3. Give natural language commands — it executes them using the same 37 Discord tools
4. Say **"Goodbye"** or **"Bye"** to end the conversation

**Voice Pipeline:** Discord Audio → Opus decode → PCM → WAV → STT → AI Planner → Tool Executor → Response text → TTS → Audio playback

**Authorization:** Only users with Administrator permission or the configured admin role can interact with the voice AI. All other speakers are silently ignored.

**Dangerous actions** (delete channel, ban member, etc.) require text-channel confirmation before executing — same plan preview system as slash commands.

## Voice Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STT_PROVIDER` | `whisper` | Speech-to-text: `whisper`, `deepgram`, `assemblyai`, `google` |
| `TTS_PROVIDER` | `openai` | Text-to-speech: `openai`, `elevenlabs`, `azure`, `google` |
| `VOICE_PERSONALITY` | `assistant` | Voice style: `friendly`, `professional`, `gaming`, `funny`, `assistant` |
| `VOICE_LANGUAGE` | `en` | Language code for STT/TTS (e.g. `en`, `es`, `ar`) |
| `VOICE_NAME` | provider default | Voice name (e.g. `onyx` for OpenAI, `Rachel` for ElevenLabs) |
| `DEEPGRAM_API_KEY` | — | Required if `STT_PROVIDER=deepgram` |
| `ASSEMBLYAI_API_KEY` | — | Required if `STT_PROVIDER=assemblyai` |
| `GOOGLE_API_KEY` | — | Required if `STT_PROVIDER=google` or `TTS_PROVIDER=google` |
| `ELEVENLABS_API_KEY` | — | Required if `TTS_PROVIDER=elevenlabs` |
| `AZURE_SPEECH_KEY` | — | Required if `TTS_PROVIDER=azure` |
| `AZURE_SPEECH_REGION` | — | Required if `TTS_PROVIDER=azure` |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Discord: discord.js v14
- AI: Multi-provider (Gemini via `@google/genai`, OpenAI/OpenRouter/Groq via fetch)
- DB (optional live data): MSSQL via `mssql` package
- Build: tsx (dev), esbuild (prod)

## Where things live

- `artifacts/discord-bot/src/` — all bot source code
  - `config/config.ts` — env var loading (single source of truth)
  - `ai/` — AI Control Center
    - `ai.service.ts` — main orchestrator (plan preview, pipeline, workspace)
    - `providers/` — multi-provider AI (gemini, openai-compatible, factory)
    - `planner.ts` — uses IAIProvider to generate plans
    - `executor.ts` — executes tool calls
    - `verifier.ts` — post-execution sanity checks
    - `observer/guild-observer.ts` — monitors guild events
    - `memory/` — ConversationMemory, LongTermMemory, MemoryManager, WorkspaceMemory
    - `tools/` — 37 Discord action tools
  - `discord/` — Discord client, message manager, embed/button builders
  - `community/tickets/` — Ticket System Pro: 10 engines (naming, category, permission, question, transcript, automation, statistics, template, panel, ticket) behind a single `ticketSystem` facade in `index.ts`; storage is per-engine JSON files under `data/tickets/` (`panels.json`, `records.json`, `templates.json`, `statistics.json`, `automation.json`, `transcripts.json`, `settings.json`)
  - `providers/` — data source abstraction (MSSQL, API, mock)

## Architecture decisions

- **Provider pattern for AI**: switching AI providers (Gemini → OpenAI) only requires changing `AI_PROVIDER` env var — no code changes
- **Plan preview for all tool plans**: every multi-step or single-dangerous-action plan shows an Execute/Cancel embed before execution — admins always know what will happen
- **Memory per-user/guild**: each admin has their own conversation session (not shared per-channel), enabling natural follow-up without repeating context
- **Workspaces**: named sessions that persist to disk and can be resumed later — ideal for multi-session projects like "Ticket System Setup"
- **Sequential status update loop**: next status update only starts after the current one finishes — prevents race conditions and duplicate embeds
- **Observer is additive**: guild event monitoring only logs to the configured log channel; it never blocks or affects the AI pipeline
- **Ticket System Pro (July 11, 2026)**: replaced the old single-file ticket service/store with 10 focused engines under `community/tickets/`, orchestrated by a `ticketSystem` facade. The legacy flat `data/tickets.json` is migrated once (idempotent, tracked in `settings.json.migratedFromLegacy`) into the new per-engine JSON files and left in place untouched as a passive backup. The `tk:*` custom ID scheme is unchanged, so panel messages already posted in Discord kept working without edits.

## Product

**Live Status**: The bot posts one embed to a Discord channel showing Conquer Online server stats (players online, peak, uptime, events) updated every 30 seconds.

**AI Operating System**: Admins can mention the bot or use `/ai` to control the entire Discord server through natural language — create channels, assign roles, set up ticket systems, schedule events, manage members, create polls, and more.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Setup status

- Bot is running via the "Discord Bot" workflow, connected to Discord, AI Control Center active (Gemini provider).
- Configured secrets: `DISCORD_BOT_TOKEN`, `CHANNEL_SERVER_STATUS`, `GEMINI_API_KEY`. Shared env vars: `SERVER_NAME=Mufasa Conquer`, `SERVER_WEBSITE`, `FACEBOOK_URL`.
- `DATA_SOURCE` is unset (defaults to `mock`) — the status embed shows "Waiting for Server Connection" until MSSQL or API credentials are added.
- Voice AI's STT/TTS providers (Whisper/OpenAI TTS) need `OPENAI_API_KEY` — not yet configured, so voice features are limited until added.
- **Total tools: 323** (239 previous + 84 new from Modules 19–24)

## Gotchas

- If the Discord bot token is reset in the Developer Portal, the old token immediately becomes invalid — update `DISCORD_BOT_TOKEN` secret and restart the workflow
- `DATA_SOURCE` defaults to `mock` (shows "Waiting for Server Connection") until MSSQL or API credentials are configured
- Discord native polls require the server's Community feature to be enabled
- The MSSQL provider has `trustServerCertificate: true` — change this before connecting to production over untrusted networks
- Workspace messages are persisted to `data/workspaces.json` in the bot's working directory

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
