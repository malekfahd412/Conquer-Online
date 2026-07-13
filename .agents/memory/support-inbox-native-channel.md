---
name: Discord-Native Support Inbox Channel/Thread Layer
description: Design decisions behind the channel+thread UI built on top of Support Inbox Pro (community/inbox + ephemeral si:* panel), for a "DM inbox that feels native" experience.
---

## Layered on top, not a replacement
The ephemeral `si:*` `/panel` inbox (search, tags, quick replies, AI translate/rewrite) was kept fully intact. The channel/thread UI is a second consumer of the same `community/inbox` store (`ic:*` custom-ID namespace, separate service class). Any future inbox feature should default to this pattern — extend the shared store, add a UI-specific renderer/service — rather than forking the data model.

## Thread visibility: ManageThreads, not per-member invites
Private threads are created under a staff-only dashboard channel. Anyone with `ManageThreads` on the **parent channel** automatically sees every private thread inside it — granting that single permission to the support-staff role on the channel overwrite gives all staff visibility into all conversation threads without maintaining per-thread member lists.

**Why:** manually adding/removing thread members per conversation doesn't scale and drifts out of sync with role changes; the parent-channel permission is enforced live by Discord.

## "Staff active now" without the Presence Intent
Real Discord presence requires the privileged `GuildPresences` intent, which also needs manual approval in the Developer Portal — enabling it in code without that approval can break bot login entirely. Instead, "active staff" is approximated via an in-memory rolling-window tracker (marked active on any reply/note/button use in the inbox), labeled honestly as "active in the last N minutes," not true online status.

**How to apply:** if a future feature seems to need presence data, check whether an activity-based proxy is good enough before touching intents — the failure mode (bot won't log in) is severe and only discovered at runtime.

## Native reply = plain message in the thread
Staff typing a normal message directly in a conversation thread is treated as the reply and forwarded verbatim to the user's DM (reacted ✅/❌ for delivery status) — no modal needed for the common case. A `!note <text>` prefix on a plain thread message is the fast-path for an internal (non-forwarded) note, reacted 📝. This mirrors how staff actually want to type ("just message them") instead of forcing a structured action for every reply.

## Multi-guild auto-provisioning
The dashboard channel is auto-created and its ID persisted per-guild (not a single global env var), because the bot can be a member of more than one guild — assuming "the" guild for a shared feature silently breaks on the second guild. Any new per-guild singleton resource (channel, pinned message, etc.) should key its persisted pointer by guild ID from the start, even if only one guild is active during initial testing.

## Pin/Edit/Delete ownership boundary
A bot can only truly edit/delete/pin a Discord message it authored. For staff replies (bot-sent DMs) actions operate on the real DM message via `user.createDM()` → `dm.messages.fetch(dmMessageId)`, so the effect is genuinely visible to the user (pin shows in their real DM pinned list, edits/deletes are real). For inbound user DMs, the bot never owns the message, so actions instead operate on the thread-mirrored copy only — edit/delete are disabled entirely for those (only pin/copy-ID/reply/rewrite make sense).

**Why:** presenting an action button that silently no-ops (or errors) on the real user message would be worse than not offering it — the ownership boundary must decide which actions are even shown per message type, not just how they're implemented.

## Approximation limits worth remembering
- **Read receipts ("Seen")**: Discord exposes no real read-state API for bot DMs. Approximated as "the user has sent any message since this reply" — good enough as a heuristic, not literally true.
- **Typing/viewing presence**: same honesty convention as staff-activity.ts — button/message activity = "viewing" (~2 min window), `typingStart` events = "typing" (~10s window); both are activity proxies, not real presence.
- **Voice messages / stickers**: discord.js bot API can't reproduce a true voice-message flag or sticker resource in an outbound DM; voice notes are detected via `attachment.waveform` + `.duration` and relabeled "🎤 Voice message", stickers are re-uploaded as plain image files. Attachments generally are re-uploaded as native files (not embed links) so Discord renders its own media players.
- **"Copy ID"**: no clipboard access from a bot — implemented as an ephemeral code-block reply the staff member copies manually.
These limits are inherent to the Discord bot API, not implementation gaps — don't attempt a "real" version without a very different (e.g. user-token/selfbot) approach, which is out of scope.
