---
name: Ticket Type Designer had generated IDs with zero route
description: "This interaction failed" root cause pattern — a button generator existed (tp-ids.ts TT.*) and was wired into renderer buttons, but the router (tp-designer.service.ts routeButton) had no matching branch at all, so the interaction was never acknowledged.
---

Symptom: clicking "Ticket Type Settings" always showed Discord's generic "This interaction failed." No exception was thrown anywhere — `routeButton()` fell through every `if (id.startsWith(...))` check with no match and returned silently, so `interaction.deferUpdate()`/`reply()` was never called and Discord's 3s ack window expired.

**Why this class of bug is easy to miss:** the custom_id generator (`TP.TT.main` etc. in tp-ids.ts) and the button that uses it (tp-renderer.ts) both existed and looked complete, giving the false impression the feature was wired end-to-end. Only grepping the router file itself (tp-designer.service.ts `routeButton`/`routeSelectMenu`/`routeModal`) for the literal prefix confirmed there was no handler branch at all.

**How to apply:** when a Discord button/select "fails silently" with no stack trace, don't assume the handler has a bug — first confirm a route branch for that custom_id prefix exists at all in the router. Add an `else`/fallthrough log (`logger.warning('[TPD] Unrouted button custom_id: ...')` + call `safeError()`) at the end of routing switches so future unrouted IDs surface as an ephemeral error instead of a silent timeout.

Fixed by adding a `tp:tt:` route: a "Ticket Type Settings" hub (`buildTTMain` in tp-renderer.ts) showing the resolved per-type config, plus real section pages for Categories/Roles/Naming (`buildTTCategories`/`buildTTRoles`/`buildTTNaming`) — each with an Edit button opening a modal (`tp:tt:modal:<panelId>:<ref>:<section>`, routed in `routeModal`) that saves via `setEntryOverrides`, and a section-scoped Reset button (`tp:tt:reset:<panelId>:<ref>:<section|all>`) alongside the original "Clear All Overrides". Remaining sections (access/mperms/sperms/vis/claim/auto/tx/stats/embed) are still stubs — clicking them returns a clear ephemeral notice instead of failing.

**Gotcha hit while building this:** `edit`/`reset` custom IDs carry a 4th segment (the target section) that a naive `const [section, panelId, ref] = segs` destructure silently drops — always destructure `edit`/`reset`/`mperm`/`sperm`/`setvis`/`ctog` style IDs positionally by index, not via a fixed-length array pattern, since they have one more segment than plain section-nav IDs.
