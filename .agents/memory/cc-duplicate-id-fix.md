---
name: Control Center duplicate custom_id fix
description: Why pagination buttons must use raw unclamped page numbers and how the validator was wired in.
---

## The rule

Pagination buttons (`◀ Prev` / `Next ▶`) in `buildCategoryPanel` must use **raw, unclamped** target-page numbers as their custom IDs:

```ts
btn('◀ Prev', `cc:pg:${category}:${safePage - 1}`, ..., safePage === 0)
btn('Next ▶', `cc:pg:${category}:${safePage + 1}`, ..., safePage >= totalPages - 1)
```

**Never** pass these through `checkPageIndex` before using them as IDs.

**Why:** When a category has `totalPages === 1` (single page), `checkPageIndex` clamps both `safePage - 1` and `safePage + 1` to `0`. Both buttons get `cc:pg:${category}:0` — identical custom IDs — and Discord rejects the message with `COMPONENT_CUSTOM_ID_DUPLICATED`. The buttons are disabled anyway, so their IDs only need to be unique, not routable. The router already clamps incoming page values inside `navToCategory`.

**How to apply:** Any time you add a disabled "previous/next" style button pair that references the same coordinate space, use raw arithmetic offsets as IDs, not clamped values.

## Other fixes applied at the same time

- `buildSearchResults` select: changed hardcoded `cc:ts:utilities:0` → `cc:ts:search:0`
- `buildFavoritesPanel` select: changed hardcoded `cc:ts:utilities:0` → `cc:ts:favs:0`

## Validator (central choke point)

`validatePayload(label, payload)` in `cc-debug.ts` serializes the payload to JSON (calling `.toJSON()` on each Builder) and checks for duplicate `custom_id` fields. It is called at the end of every `buildXxx()` function in `cc-renderer.ts` before the payload is returned. Discord.js stores IDs as `data.custom_id`, not as a `.customId` property — serialize via `JSON.parse(JSON.stringify(payload))` to access them.
