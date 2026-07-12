---
name: Review Analytics Pro
description: Architecture for the ra:* Review Analytics Control Center page — wiring, routing, and computation patterns.
---

## System overview
Standalone CC designer (`review-analytics-designer.ts`) + pure computation layer (`review-analytics-engine.ts`). Reads `reviews.json` via `reviewEngine.getAll(guildId)` — no new storage. Accessible from the Tickets CC category via `⭐ Review Analytics` button.

## Custom ID encoding
Every interactive button encodes both view and period:
```
ra:v:<view>:<period>
  view:   ov (Overview) | st (Staff) | ty (Types) | bd (Leaderboard)
  period: td (Today)    | 7d         | 30d         | al (All Time)
```
Entry point `ra:home` → redirects to `ov:al`. Parsing: `id.split(':')` → `[ra, v, view, period]`.

**Why:** Stateless buttons — no session/cache needed. Switching filter keeps you on the same page, switching page keeps the same filter, all with one encoding scheme.

## Trend vs filter
- Period filter affects: totalReviews, avgRating, distribution, staffStats, typeStats, topRated, mostReviewed
- Trend (today/week/month/all-time) is ALWAYS computed from the full guild dataset regardless of filter — provides a stable reference point.

## Routing in ai.service.ts
`isRAInteraction(id)` → routes to `reviewAnalyticsDesigner.handleInteraction(interaction, guild)`. Placed after SLA block, before review DM block. Requires guild (CC-only, never DM).

## Leaderboard qualification
Staff need ≥ 2 reviews to appear in Top Rated / bestStaff / worstStaff. No minimum for Most Reviewed. This prevents single-review noise from dominating the leaderboard.

## Embed structure (per view)
- Overview: distribution bar chart + trend field + best/worst staff inline
- Staff: numbered list (max 10) + best/worst/highest-volume inline fields
- Types: numbered list (max 10) + fastest/slowest response + fastest/slowest resolution
- Leaderboard: two fields — top rated (medals 🥇🥈🥉) and most reviewed

## No-data state
Each view has a dedicated `noDataEmbed()` that explains the feature and points admins to enable Review System on a panel. Never shows empty/broken embeds.
