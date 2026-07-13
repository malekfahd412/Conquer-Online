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
