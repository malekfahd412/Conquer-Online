---
name: Discord AI OS architecture
description: Key design decisions for the Conquer Online Discord AI bot (multi-provider AI, voice pipeline, 37 tools, plan preview, workspace memory)
---

# Discord AI OS — Architecture Decisions

## Voice AI integration
Voice is wired through `AIService` — `VoiceManager` is created inside `AIService.initialize()` when `config.voice` is present (always set from env). It shares the same `pendingButtons` Map so text-channel confirmation buttons from voice dangerous-action prompts are handled by the same `interactionCreate` listener.

**Why:** Keeps the button dispatch map as a single source of truth; avoids a second listener competing for button interactions.

**How to apply:** If adding new button-based confirmation flows in voice, register them against `this.pendingButtons` (exposed to VoiceManager at construction time) not a new map.

## Voice authorization gate
`VoiceSession.setupReceiver` caches per-speaker authorization in `authorizedUsers`/`deniedUsers` Sets. On first utterance from a user, it fetches the guild member and runs `VoicePermissions.canUseVoiceAI`. Subsequent utterances use the cache.

**Why:** Non-admins could otherwise trigger tool execution by speaking in the channel after an admin runs `/voice join`. The cache avoids a Discord API call on every utterance.

**How to apply:** Any future per-speaker feature in VoiceSession should follow the same fetch-once-cache pattern.

## AI components are owned by AIService
`MemoryManager`, `Planner`, `Executor`, `ToolRegistry`, `PromptBuilder` are all private fields of `AIService`. Voice gets them via the `VoiceAIComponents` object passed at VoiceManager construction.

**Why:** Keeps a single instance of each component shared across text/slash and voice pipelines — conversation memory is unified.

## Config defaults
- STT defaults to `whisper` (needs `OPENAI_API_KEY`)
- TTS defaults to `openai` (needs `OPENAI_API_KEY`)
- Voice personality defaults to `assistant`
- `CHANNEL_AI_LOG` is reused as the voice confirmation channel (can be overridden by pointing `confirmChannelId` to a different channel in future)
