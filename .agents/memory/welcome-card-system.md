---
name: Welcome Card (dynamic join image) system
description: ProBot-style canvas-generated welcome image — feature toggle, coordinate semantics, font/upload approach.
---

- Feature is toggled implicitly by presence of `card.backgroundImage` in the guild's welcome config — no separate enabled flag. Unset means the old embed image/thumbnail path runs untouched; this was chosen so the feature ships with zero risk to existing installs.
- Avatar coordinates (`avatarX`/`avatarY`) are the top-left corner of the avatar's bounding square; `avatarSize` is the diameter. All text coordinates are baseline-centered `fillText` points. These semantics must stay consistent between the renderer and the Designer's modals — a coordinate convention change in one without the other silently misplaces every existing guild's card.
- Username/server name/member count share one `textColor`/`fontSize`/`fontFamily` triple (username drawn bold/larger, the other two at ~60% size) rather than per-element styling — deliberate scope reduction vs. a fully independent style per text element.
- Background images are uploaded via a Discord message-collector flow (admin sends an attachment in the same channel within a time window) and stored locally under `data/welcome-backgrounds/<guildId>.<ext>`, not as external URLs — chosen for reliability over relying on third-party CDNs.
- Bundled fonts are Poppins (static Regular+Bold), plus Montserrat and Inter as single variable-font files (regular weight only reliable, since Google Fonts no longer ships static weights for those two upstream). `DejaVu Sans` is kept as the always-available system fallback needing no bundling.
- `@napi-rs/canvas`'s `loadImage` accepts a `Buffer` directly and `Canvas.encode('png')` returns `Promise<Buffer>` — no intermediate file needed for either backgrounds or avatars.
