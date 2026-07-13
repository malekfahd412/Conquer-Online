---
name: Companion Mode
description: Architecture and wiring for the Companion Mode friendly AI chat feature
---

# Companion Mode

## Files
- `companion/companion-store.ts` — per-user profiles in `data/companion/profiles.json`
- `companion/companion.service.ts` — AI companion service (isolated from admin AI)

## Slash commands
`/chat talk <message>`, `/chat reset`, `/chat profile` — added to slash-command-registrar.ts

## AI call mechanism
`CompanionService` accepts a `callAI` callback. In ai.service.ts it's wired as:
```typescript
callAI: (messages) => this.planner.reflect(messages as ConversationMessage[])
```
`planner.reflect()` calls the AI with no tools and returns plain text — perfect for companion.

## Message routing (onMessage in ai.service.ts)
Admin AI path: `isAdmin && (inAiChannel || mentionsBot)` — unchanged behavior
Non-admin path: if `mentionsBot || inCompanionChannel || isReplyToBot` → companion
Admin in non-AI-channel: if `inCompanionChannel || isReplyToBot` (not mentioning bot outside AI channel) → companion

## Reply-to-bot detection
Async fetch of referenced message — only done when `!inAiChannel && !mentionsBot && message.reference?.messageId`

## Dedicated companion channel
Optional `CHANNEL_COMPANION` env var. All messages in that channel → companion (for anyone).

## Friendship thresholds
Stranger→Regular: 8 conversations, Regular→Friend: 25, Friend→Best Friend: 60

## Memory extraction
Runs on every user message — extracts nickname ("call me X"), memorandums ("remember that..."), games (keyword match), interests (keyword match). Stored in profile, referenced in system prompt.

**Why:**
Completely isolated from admin AI — separate store path, separate system prompt, separate routing. This ensures companion mode never accidentally triggers tool execution or accesses admin-only state.
