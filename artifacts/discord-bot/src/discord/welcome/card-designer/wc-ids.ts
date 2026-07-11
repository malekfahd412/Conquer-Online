/**
 * Custom-ID factory for the Welcome Card Designer.
 *
 * ALL wc:* custom IDs must be generated here. Routed in ai.service.ts by
 * checking `isWCInteraction(customId)` before the tk:* block, then delegated
 * to WelcomeCardDesigner.handleInteraction / handleModal.
 *
 * Routing map:
 *   wc:home                  → Designer home / dashboard
 *   wc:bg:upload              → Start background-image upload flow (message collector)
 *   wc:avatar                → Show avatar position/size edit modal
 *   wc:avatar:m               → Avatar position/size modal submit
 *   wc:border                → Border settings page
 *   wc:border:toggle          → Toggle border on/off
 *   wc:border:edit            → Show border width/color edit modal
 *   wc:border:m               → Border width/color modal submit
 *   wc:text:username          → Show username position edit modal
 *   wc:text:username:m        → Username position modal submit
 *   wc:text:server            → Show server-name position edit modal
 *   wc:text:server:m          → Server-name position modal submit
 *   wc:text:members           → Show member-count position edit modal
 *   wc:text:members:m         → Member-count position modal submit
 *   wc:style                 → Show font size/color edit modal
 *   wc:style:m                → Font size/color modal submit
 *   wc:font:select            → Font family select menu customId
 *   wc:preview                → Render + reply with a live preview
 *
 *   wc:msg                   → Welcome Message editor page
 *   wc:msg:toggle             → Toggle embed on/off
 *   wc:msg:content            → Show content edit modal
 *   wc:msg:content:m          → Content modal submit
 *   wc:msg:embed              → Show embed title/desc/color/footer modal
 *   wc:msg:embed:m            → Embed modal submit
 *   wc:msg:media              → Show thumbnail/image/timestamp modal
 *   wc:msg:media:m            → Media modal submit
 *
 *   wc:publish                → Show publish channel modal
 *   wc:publish:m              → Publish modal submit (saves channelId + enables)
 *   wc:test                  → Send test card + message to configured channel
 */

export const WC = {
  HOME:        'wc:home',
  BG_UPLOAD:   'wc:bg:upload',
  AVATAR:      'wc:avatar',
  AVATAR_M:    'wc:avatar:m',
  BORDER:      'wc:border',
  BORDER_TOGGLE: 'wc:border:toggle',
  BORDER_EDIT: 'wc:border:edit',
  BORDER_M:    'wc:border:m',
  TEXT_USERNAME:   'wc:text:username',
  TEXT_USERNAME_M: 'wc:text:username:m',
  TEXT_SERVER:     'wc:text:server',
  TEXT_SERVER_M:   'wc:text:server:m',
  TEXT_MEMBERS:    'wc:text:members',
  TEXT_MEMBERS_M:  'wc:text:members:m',
  STYLE:       'wc:style',
  STYLE_M:     'wc:style:m',
  FONT_SELECT: 'wc:font:select',
  PREVIEW:     'wc:preview',

  // Welcome Message editor
  MSG:             'wc:msg',
  MSG_TOGGLE:      'wc:msg:toggle',
  MSG_CONTENT:     'wc:msg:content',
  MSG_CONTENT_M:   'wc:msg:content:m',
  MSG_EMBED:       'wc:msg:embed',
  MSG_EMBED_M:     'wc:msg:embed:m',
  MSG_MEDIA:       'wc:msg:media',
  MSG_MEDIA_M:     'wc:msg:media:m',

  // Publish & Test
  PUBLISH:   'wc:publish',
  PUBLISH_M: 'wc:publish:m',
  TEST:      'wc:test',
} as const;

export function isWCInteraction(customId: string): boolean {
  return customId.startsWith('wc:');
}
