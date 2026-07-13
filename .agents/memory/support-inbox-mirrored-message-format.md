---
name: Support Inbox mirrored-message plain-text format
description: How the ic:* native thread mirror renders speaker attribution without embeds; when to reuse vs. leave embeds alone.
---

The `ic:*` Discord-native thread mirror (`ic-renderer.ts` / `inbox-channel.service.ts`) renders
every live conversation message — inbound user DM, staff reply, AI-tool output, system notice —
as **plain text**, not an embed: `"{DisplayName}:\n{content}"`. Files/attachments are still sent
as native Discord attachments (they render below any text content automatically).

**Why:** embeds hide behind a "who's speaking" author line that's easy to miss in a fast support
chat; plain text with the name inline is more scannable and lets Discord's own per-message
timestamp do the timestamping (no need to fake one). AI-tool output is attributed to "Nova AI",
system notices to "Nova System" — both introduced as fixed labels since no bot persona/name existed
before.

**How to apply:** name resolution uses `resolveDisplayName(member, user, fallbackTag)` = guild
`member.displayName` (already falls back nickname → global name → username internally) → then
`user.globalName` → `user.username` → fallback tag. Reuse `formatSpeakerMessage(name, content)` for
the `"Name:\nContent"` shape. Message content is capped at 2000 chars (Discord's plain-content
limit — embeds allow up to 4096, so truncation budgets shrank when converting).

Scope boundary that was deliberately kept: the ephemeral `/panel` summary view (`si:*`,
`inbox-renderer.ts`'s field-based digest embed) and the private staff-only AI-rewrite preview
(ephemeral, "Apply" button) were left as embeds — they aren't part of the live mirrored
conversation stream, so "no embeds for normal text messages" doesn't apply to them.
