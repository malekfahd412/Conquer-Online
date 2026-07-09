---
name: Discord AI OS architecture
description: Key design decisions, security patterns, and gotchas for the Conquer Online AI Discord bot
---

## Multi-provider AI
`AI_PROVIDER` env var selects: `gemini` (default), `openai`, `openrouter`, `groq`. All OpenAI-compatible providers share `OpenAICompatibleProvider` (fetch-based). Factory lives at `src/ai/providers/provider.factory.ts`.

**Why:** Gemini is the default and uses `@google/genai`; the others use the OpenAI `/chat/completions` REST format — one provider class handles all three via different base URLs.

## Plan preview button security
Pending confirmation buttons are stored as `Map<string, PendingButton>` where `PendingButton = { userId, executing, callback }`. The `interactionCreate` handler checks `entry.userId === interaction.user.id` before executing. `executing: boolean` guards against double execution if two interactions resolve near-simultaneously.

**Why:** Any user who can see the embed could previously click Execute/Cancel — broken access control on the highest-risk path.

## Workspace sync — all branches must sync
User messages AND assistant responses (including text-only turns) must be synced to the active workspace via `syncToWorkspace()`. Originally only tool-call turns were synced. The helper `syncToWorkspace(userId, guildId, msg)` centralizes this.

**Why:** Resumed workspaces missed user prompts and text-only responses, breaking context continuity.

## Workspace resume restores structured state
`/workspace resume` calls both `addRawMessage` (for the last 30 messages) AND `memoryManager.restoreWorkspaceSession(userId, guildId, ws)` which calls `ConversationMemory.restoreState()` to restore objects, actions, context, currentTask, taskSteps.

**Why:** Without this, resumed sessions had messages but lost the AI's awareness of what objects existed.

## Workspace flush on shutdown
`AIService.stop()` calls `workspaceMemory.flush()` before `memoryManager.stop()`. The periodic flush is every 5 minutes.

**Why:** A restart or crash between periodic flushes would lose up to 5 minutes of workspace writes.

## Memory is per-user/guild (NOT per-channel)
`MemoryManager` keys sessions by `${userId}:${guildId}`. Supports independent conversations per admin per server.

## Tool count
37 tools registered at startup (was 23 before this session).

## Slash commands registered
6 commands in guild `1213437502078062674`: `/ai`, `/forget`, `/memory`, `/preferences`, `/resetpreferences`, `/workspace` (with 5 subcommands).

## ConversationMemory expiry
Sessions expire after 30 minutes of inactivity (EXPIRY_MS constant). Checked lazily on next access; cleanup interval runs every 5 minutes.
