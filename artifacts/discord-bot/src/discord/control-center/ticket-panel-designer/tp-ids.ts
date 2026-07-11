/**
 * Custom-ID factory for the Ticket Panel Designer.
 *
 * ALL tp:* custom IDs must be generated here. Routing is handled by
 * TicketPanelDesignerService which checks `isTPInteraction(customId)` first,
 * then delegates within tp-designer.service.ts.
 *
 * Routing map:
 *   tp:list                         → panel list (page 0)
 *   tp:list:<offset>                → panel list paginated
 *   tp:new                          → show create-panel modal
 *   tp:new:m                        → create-panel modal submit
 *   tp:dash:<panelId>               → panel dashboard
 *   tp:section:<panelId>:<key>      → section screen
 *   tp:toggle:<panelId>:<field>     → toggle boolean field
 *   tp:preview:<panelId>            → live preview (no publish)
 *   tp:del:<panelId>                → delete confirm screen
 *   tp:del:yes:<panelId>            → confirmed delete
 *   tp:edit:<panelId>:<field>       → show edit modal for field
 *   tp:modal:<panelId>:<field>      → edit modal submit
 *   tp:pub:m:<panelId>              → publish-channel modal submit
 *   tp:repub:<panelId>              → republish to same channel
 *   tp:btn:primary:<panelId>        → edit primary button modal
 *   tp:btn:primary:m:<panelId>      → primary button modal submit
 *   tp:btn:add:<panelId>            → add extra button modal
 *   tp:btn:add:m:<panelId>          → add extra button modal submit
 *   tp:btn:detail:<panelId>:<idx>   → extra button detail view
 *   tp:btn:edit:<panelId>:<idx>     → edit extra button modal
 *   tp:btn:edit:m:<panelId>:<idx>   → edit extra button modal submit
 *   tp:btn:rm:<panelId>:<idx>       → remove extra button
 *   tp:sm:add:<panelId>             → add select option modal
 *   tp:sm:add:m:<panelId>           → add select option modal submit
 *   tp:sm:opt:<panelId>:<idx>       → select option detail view
 *   tp:sm:edit:<panelId>:<idx>      → edit select option modal
 *   tp:sm:edit:m:<panelId>:<idx>    → edit select option modal submit
 *   tp:sm:rm:<panelId>:<idx>        → remove select option
 *   tp:q:add:<panelId>              → add question modal
 *   tp:q:add:m:<panelId>            → add question modal submit
 *   tp:q:detail:<panelId>:<idx>     → question detail view
 *   tp:q:edit:<panelId>:<idx>       → edit question modal
 *   tp:q:edit:m:<panelId>:<idx>     → edit question modal submit
 *   tp:q:rm:<panelId>:<idx>         → remove question
 *   tp:ps:<offset>                  → panel list select menu
 *   tp:ebs:<panelId>                → extra buttons select menu
 *   tp:sos:<panelId>                → select menu options select
 *   tp:qs:<panelId>                 → questions select menu
 */

export type SectionKey =
  | 'general'
  | 'appearance'
  | 'button'
  | 'permissions'
  | 'questions'
  | 'categories'
  | 'naming'
  | 'lifecycle'
  | 'automation'
  | 'transcripts'
  | 'stats'
  | 'publish';

export const TP = {
  LIST:         'tp:list',
  NEW:          'tp:new',
  NEW_M:        'tp:new:m',

  list:         (offset: number): string         => `tp:list:${offset}`,
  dash:         (panelId: string): string        => `tp:dash:${panelId}`,
  section:      (panelId: string, key: SectionKey): string => `tp:section:${panelId}:${key}`,
  toggle:       (panelId: string, field: string): string   => `tp:toggle:${panelId}:${field}`,
  preview:      (panelId: string): string        => `tp:preview:${panelId}`,
  del:          (panelId: string): string        => `tp:del:${panelId}`,
  delYes:       (panelId: string): string        => `tp:del:yes:${panelId}`,
  edit:         (panelId: string, field: string): string   => `tp:edit:${panelId}:${field}`,
  modal:        (panelId: string, field: string): string   => `tp:modal:${panelId}:${field}`,
  pubModal:     (panelId: string): string        => `tp:pub:m:${panelId}`,
  repub:        (panelId: string): string        => `tp:repub:${panelId}`,

  btnPrimary:   (panelId: string): string        => `tp:btn:primary:${panelId}`,
  btnPrimaryM:  (panelId: string): string        => `tp:btn:primary:m:${panelId}`,
  btnAdd:       (panelId: string): string        => `tp:btn:add:${panelId}`,
  btnAddM:      (panelId: string): string        => `tp:btn:add:m:${panelId}`,
  btnDetail:    (panelId: string, idx: number): string => `tp:btn:detail:${panelId}:${idx}`,
  btnEdit:      (panelId: string, idx: number): string => `tp:btn:edit:${panelId}:${idx}`,
  btnEditM:     (panelId: string, idx: number): string => `tp:btn:edit:m:${panelId}:${idx}`,
  btnRm:        (panelId: string, idx: number): string => `tp:btn:rm:${panelId}:${idx}`,

  smAdd:        (panelId: string): string        => `tp:sm:add:${panelId}`,
  smAddM:       (panelId: string): string        => `tp:sm:add:m:${panelId}`,
  smOpt:        (panelId: string, idx: number): string => `tp:sm:opt:${panelId}:${idx}`,
  smEdit:       (panelId: string, idx: number): string => `tp:sm:edit:${panelId}:${idx}`,
  smEditM:      (panelId: string, idx: number): string => `tp:sm:edit:m:${panelId}:${idx}`,
  smRm:         (panelId: string, idx: number): string => `tp:sm:rm:${panelId}:${idx}`,

  qAdd:         (panelId: string): string        => `tp:q:add:${panelId}`,
  qAddM:        (panelId: string): string        => `tp:q:add:m:${panelId}`,
  qDetail:      (panelId: string, idx: number): string => `tp:q:detail:${panelId}:${idx}`,
  qEdit:        (panelId: string, idx: number): string => `tp:q:edit:${panelId}:${idx}`,
  qEditM:       (panelId: string, idx: number): string => `tp:q:edit:m:${panelId}:${idx}`,
  qRm:          (panelId: string, idx: number): string => `tp:q:rm:${panelId}:${idx}`,

  panelSelect:  (offset: number): string         => `tp:ps:${offset}`,
  extraBtnSel:  (panelId: string): string        => `tp:ebs:${panelId}`,
  smOptSel:     (panelId: string): string        => `tp:sos:${panelId}`,
  qSel:         (panelId: string): string        => `tp:qs:${panelId}`,
} as const;

export function isTPInteraction(customId: string): boolean {
  return customId.startsWith('tp:');
}

export const SECTION_META: Record<SectionKey, { label: string; emoji: string }> = {
  general:     { label: 'General',     emoji: '⚙️' },
  appearance:  { label: 'Appearance',  emoji: '🎨' },
  button:      { label: 'Button',      emoji: '🔘' },
  permissions: { label: 'Permissions', emoji: '🔐' },
  questions:   { label: 'Questions',   emoji: '❓' },
  categories:  { label: 'Categories',  emoji: '📁' },
  naming:      { label: 'Naming',      emoji: '📝' },
  lifecycle:   { label: 'Lifecycle',   emoji: '🔄' },
  automation:  { label: 'Automation',  emoji: '🤖' },
  transcripts: { label: 'Transcripts', emoji: '📄' },
  stats:       { label: 'Statistics',  emoji: '📊' },
  publish:     { label: 'Publish',     emoji: '📤' },
};
