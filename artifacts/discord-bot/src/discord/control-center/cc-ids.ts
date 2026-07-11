/**
 * Centralized custom-ID factory for the Discord Control Center.
 *
 * ALL cc:* custom IDs must be generated here — never constructed inline
 * in renderers or service files. One function per ID shape.
 *
 * Routing rules (for reference in cc-panel.service.ts):
 *   cc:home           → navigate home
 *   cc:cancel         → navigate home (alias)
 *   cc:favs           → navigate to favorites
 *   cc:srch           → show search modal
 *   cc:cs             → category select (part 1)
 *   cc:cs2            → category select (part 2)
 *   cc:ts:<cat>:<pg>  → tool select (navigates to selected tool)
 *   cc:pg:<cat>:<pg>  → pagination button (raw unclamped page)
 *   cc:cat:<cat>      → back to category page 0
 *   cc:tool:<name>    → navigate to tool detail
 *   cc:exec:<name>    → start execute flow (modal or direct)
 *   cc:do:<name>      → confirmed dangerous execute
 *   cc:fav:<name>     → toggle favorite
 *   cc:modal:<name>   → modal submit (from buildToolModal)
 *   cc:search_submit  → search modal submit
 */
export const CC = {
  HOME:           'cc:home',
  CANCEL:         'cc:cancel',
  FAVS:           'cc:favs',
  SRCH:           'cc:srch',
  CAT_SELECT:     'cc:cs',
  CAT_SELECT2:    'cc:cs2',
  SEARCH_SUBMIT:  'cc:search_submit',
  SEARCH_SELECT:  'cc:ts:search:0',
  FAVS_SELECT:    'cc:ts:favs:0',

  toolSelect: (category: string, page: number): string => `cc:ts:${category}:${page}`,
  /**
   * Pagination button custom ID. Pass RAW (unclamped) target page.
   * Never clamp before calling — clamping both prev and next toward
   * the same boundary page creates duplicate IDs (the original bug).
   */
  page:       (category: string, rawPage: number): string => `cc:pg:${category}:${rawPage}`,
  cat:        (category: string): string => `cc:cat:${category}`,
  tool:       (toolName: string): string => `cc:tool:${toolName}`,
  exec:       (toolName: string): string => `cc:exec:${toolName}`,
  doExec:     (toolName: string): string => `cc:do:${toolName}`,
  fav:        (toolName: string): string => `cc:fav:${toolName}`,
  modal:      (toolName: string): string => `cc:modal:${toolName}`,
} as const;
