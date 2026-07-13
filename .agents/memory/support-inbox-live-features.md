---
name: Support Inbox Pro — Live Sync, Typing, Read Receipts, Attachments, Quick Replies
description: Non-obvious Discord API constraints and design choices behind Support Inbox Pro's live-update features (added on top of the base architecture in support-inbox-pro.md).
---

## Live Sync approximation
Discord gives staff-facing ephemeral panels no push mechanism, so "live sync" is done by tracking each staff member's currently-open screen (list or one conversation) by their Discord user ID in a small in-memory registry, and re-rendering + `editReply()`-ing every tracked screen when a new DM or staff reply comes in.

**Why:** an interaction's webhook token can still edit "the original response" (the same message) even after other, newer interactions have separately edited that same message — edits are last-write-wins on the message resource, not tied to "whoever is current." This means holding an older interaction object and calling `editReply()` on it later still works, as long as the token hasn't expired.

**Constraint:** interaction webhook tokens expire ~15 minutes after issuance. Once expired, `editReply()` throws and the tracked view is silently dropped (staff must reopen the panel to resume live updates). There is no workaround for this — it's a hard Discord limit, not a bug.

**How to apply:** only one screen per staff member is tracked at a time (opening a new screen replaces the old entry). Screens that aren't the list or a conversation (search results, AI output, quick-reply picker/manager) explicitly clear the registry entry so a stray live update doesn't unexpectedly snap the staff member's screen back to the conversation view.

## Typing indicator via modals
Discord does not expose keystroke-level "user is typing in this modal" events. The indicator is approximated as: start `channel.sendTyping()` (repeated every ~8s, since each call only lasts ~10s) the instant the Reply modal is opened, and stop it the instant the modal is submitted. A safety timeout auto-stops it if the staff member abandons the modal without submitting (no cancel event exists either).

## Discord per-message caps that constrain UI additions
Any new UI addition to an already-dense Discord panel must respect: 5 action rows/message, 5 buttons/row, 25 options/select menu, 10 embeds/message. Support Inbox's conversation view was already at 4 action rows before these features, leaving exactly one row of headroom — new controls had to be folded into existing rows (e.g. Quick Reply button added into the existing Reply/Note/Read/Close row) rather than assumed to get their own row.
