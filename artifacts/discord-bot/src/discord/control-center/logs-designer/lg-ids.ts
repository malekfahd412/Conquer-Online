/**
 * Custom-ID factory for the Logs Designer.
 *
 * All lg:* custom IDs must be generated here. Routing is handled by
 * LogsDesignerService which checks `isLGInteraction(customId)` first.
 *
 * Routing map:
 *   lg:dash                → dashboard (all log types overview)
 *   lg:type:<type>         → type detail screen
 *   lg:toggle:<type>       → toggle enabled/disabled for a type
 *   lg:setch:<type>        → show set-channel modal for a type
 *   lg:setch:m:<type>      → set-channel modal submit
 *   lg:test:<type>         → send a test embed to the configured channel
 *   lg:preview:<type>      → preview the embed ephemerally (no channel needed)
 *   lg:typesel             → select menu on dashboard: navigate to type
 */

export const LG = {
  DASH:   'lg:dash',

  dash:     (): string               => 'lg:dash',
  type:     (t: string): string      => `lg:type:${t}`,
  toggle:   (t: string): string      => `lg:toggle:${t}`,
  setch:    (t: string): string      => `lg:setch:${t}`,
  setchM:   (t: string): string      => `lg:setch:m:${t}`,
  test:     (t: string): string      => `lg:test:${t}`,
  preview:  (t: string): string      => `lg:preview:${t}`,
  TYPESEL:  'lg:typesel',
} as const;

export function isLGInteraction(customId: string): boolean {
  return customId.startsWith('lg:');
}
