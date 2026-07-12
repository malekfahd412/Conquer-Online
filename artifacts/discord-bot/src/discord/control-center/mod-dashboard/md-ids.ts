/**
 * Custom-ID factory for the Moderation Dashboard (md:* prefix).
 *
 * Routing map:
 *   md:dash                  → main dashboard
 *   md:cfg:autopunish        → auto-punishment config view
 *   md:cfg:reasons           → default reasons view
 *   md:cfg:roles             → mod roles view (role select)
 *   md:toggledm              → toggle DM on punish
 *   md:setprefix             → show set-prefix modal
 *   md:setprefix:m           → set-prefix modal submit
 *   md:setautopunish         → show auto-punish thresholds modal
 *   md:setautopunish:m       → auto-punish modal submit
 *   md:setreasons            → show default reasons modal
 *   md:setreasons:m          → default reasons modal submit
 *   md:rolesel               → role select menu submit
 *   md:toggleautopunish      → toggle auto-punish on/off
 */

export const MD = {
  DASH:              'md:dash',
  CFG_AUTOPUNISH:    'md:cfg:autopunish',
  CFG_REASONS:       'md:cfg:reasons',
  CFG_ROLES:         'md:cfg:roles',
  TOGGLE_DM:         'md:toggledm',
  TOGGLE_AUTOPUNISH: 'md:toggleautopunish',
  SET_PREFIX:        'md:setprefix',
  SET_PREFIX_M:      'md:setprefix:m',
  SET_AUTOPUNISH:    'md:setautopunish',
  SET_AUTOPUNISH_M:  'md:setautopunish:m',
  SET_REASONS:       'md:setreasons',
  SET_REASONS_M:     'md:setreasons:m',
  ROLE_SEL:          'md:rolesel',
} as const;

export function isMDInteraction(customId: string): boolean {
  return customId.startsWith('md:');
}
