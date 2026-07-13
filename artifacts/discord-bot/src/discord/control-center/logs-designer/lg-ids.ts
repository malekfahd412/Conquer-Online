/**
 * Custom-ID factory for the Logs Designer (Phase 2).
 *
 * Routing map:
 *   lg:dash                    → category dashboard
 *   lg:cat:<catKey>            → category view (types in that category)
 *   lg:catsel:<catKey>         → select menu: navigate to type within a category
 *   lg:type:<type>             → type detail screen
 *   lg:toggle:<type>           → toggle enabled/disabled
 *   lg:togglebots:<type>       → toggle ignoreBots
 *   lg:setch:<type>            → show set-channel modal
 *   lg:setch:m:<type>          → set-channel modal submit
 *   lg:setcolor:<type>         → show set-color modal
 *   lg:setcolor:m:<type>       → set-color modal submit
 *   lg:setmentions:<type>      → show set-mention-roles modal (legacy — kept for compat)
 *   lg:setmentions:m:<type>    → set-mention-roles modal submit (legacy)
 *   lg:setmenrole:<type>       → open native role-picker view (replaces message with picker)
 *   lg:setmenrole:s:<type>     → RoleSelectMenu submit — saves selected roles
 *   lg:clrmenrole:<type>       → clear all mention roles for this log type
 *   lg:togglecritical:<type>   → toggle mentionCriticalOnly on/off
 *   lg:setignoreu:<type>       → show ignore-users modal
 *   lg:setignoreu:m:<type>     → ignore-users modal submit
 *   lg:setignorer:<type>       → show ignore-roles modal
 *   lg:setignorer:m:<type>     → ignore-roles modal submit
 *   lg:test:<type>             → send a test embed to the configured channel
 *   lg:preview:<type>          → preview the embed ephemerally
 */

export const LG = {
  DASH: 'lg:dash',

  dash:            (): string          => 'lg:dash',
  cat:             (k: string): string => `lg:cat:${k}`,
  catsel:          (k: string): string => `lg:catsel:${k}`,
  type:            (t: string): string => `lg:type:${t}`,
  toggle:          (t: string): string => `lg:toggle:${t}`,
  toggleBots:      (t: string): string => `lg:togglebots:${t}`,
  setch:           (t: string): string => `lg:setch:${t}`,
  setchM:          (t: string): string => `lg:setch:m:${t}`,
  setcolor:        (t: string): string => `lg:setcolor:${t}`,
  setcolorM:       (t: string): string => `lg:setcolor:m:${t}`,
  setmentions:     (t: string): string => `lg:setmentions:${t}`,
  setmentionsM:    (t: string): string => `lg:setmentions:m:${t}`,
  setmenrole:      (t: string): string => `lg:setmenrole:${t}`,
  setmenroleS:     (t: string): string => `lg:setmenrole:s:${t}`,
  clrmenrole:      (t: string): string => `lg:clrmenrole:${t}`,
  togglecritical:  (t: string): string => `lg:togglecritical:${t}`,
  setignoreu:      (t: string): string => `lg:setignoreu:${t}`,
  setignoreuM:     (t: string): string => `lg:setignoreu:m:${t}`,
  setignorer:      (t: string): string => `lg:setignorer:${t}`,
  setignorерM:     (t: string): string => `lg:setignorer:m:${t}`, // eslint-disable-line -- key has Cyrillic 'е' to avoid name collision; value is ASCII
  test:            (t: string): string => `lg:test:${t}`,
  preview:         (t: string): string => `lg:preview:${t}`,
} as const;

export function isLGInteraction(customId: string): boolean {
  return customId.startsWith('lg:');
}
