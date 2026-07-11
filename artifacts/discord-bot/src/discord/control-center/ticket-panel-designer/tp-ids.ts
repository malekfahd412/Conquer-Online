/**
 * Custom-ID factory for the Ticket Panel Designer.
 *
 * ALL tp:* custom IDs must be generated here. Routing is handled by
 * TicketPanelDesignerService which checks `isTPInteraction(customId)` first,
 * then delegates within tp-designer.service.ts.
 *
 * Routing map:
 *   tp:list                          → panel list (page 0)
 *   tp:list:<offset>                 → panel list paginated
 *   tp:new                           → show create-panel modal
 *   tp:new:m                         → create-panel modal submit
 *   tp:dash:<panelId>                → panel dashboard
 *   tp:section:<panelId>:<key>       → section screen
 *   tp:toggle:<panelId>:<field>      → toggle boolean field
 *   tp:preview:<panelId>             → live preview (no publish)
 *   tp:del:<panelId>                 → delete confirm screen
 *   tp:del:yes:<panelId>             → confirmed delete
 *   tp:edit:<panelId>:<field>        → show edit modal for field
 *   tp:modal:<panelId>:<field>       → edit modal submit
 *   tp:pub:m:<panelId>               → publish-channel modal submit
 *   tp:repub:<panelId>               → republish to same channel
 *   tp:btn:primary:<panelId>         → edit primary button modal
 *   tp:btn:primary:m:<panelId>       → primary button modal submit
 *   tp:btn:add:<panelId>             → add extra button modal
 *   tp:btn:add:m:<panelId>           → add extra button modal submit
 *   tp:btn:detail:<panelId>:<idx>    → extra button detail view
 *   tp:btn:edit:<panelId>:<idx>      → edit extra button modal
 *   tp:btn:edit:m:<panelId>:<idx>    → edit extra button modal submit
 *   tp:btn:rm:<panelId>:<idx>        → remove extra button
 *   tp:sm:add:<panelId>              → add select option modal
 *   tp:sm:add:m:<panelId>            → add select option modal submit
 *   tp:sm:opt:<panelId>:<idx>        → select option detail view
 *   tp:sm:edit:<panelId>:<idx>       → edit select option modal
 *   tp:sm:edit:m:<panelId>:<idx>     → edit select option modal submit
 *   tp:sm:rm:<panelId>:<idx>         → remove select option
 *   tp:ps:<offset>                   → panel list select menu
 *   tp:ebs:<panelId>                 → extra buttons select menu
 *   tp:sos:<panelId>                 → select menu options select
 *   tp:gallery                       → template gallery (page 0)
 *   tp:tpl:detail:<tplId>            → template detail/preview
 *   tp:tpl:use:<tplId>               → show create-from-template modal
 *   tp:tpl:use:m:<tplId>             → create-from-template modal submit
 *   tp:tpl:save:<panelId>            → show save-as-template modal
 *   tp:tpl:save:m:<panelId>          → save-as-template modal submit
 *   tp:tpl:del:yes:<tplId>           → confirmed template delete
 *   tp:tpl:del:<tplId>               → template delete confirm screen
 *   tp:tgs:<offset>                  → template gallery select menu
 *
 * Permission Designer (tp:pd:*) sub-namespace:
 *   tp:pd:<panelId>                  → PD main page
 *   tp:pd:team:<panelId>             → Support team editor
 *   tp:pd:mperms:<panelId>           → Member permission toggles
 *   tp:pd:sperms:<panelId>           → Staff permission toggles
 *   tp:pd:vis:<panelId>              → Visibility mode selector
 *   tp:pd:claim:<panelId>            → Claim behaviour toggles
 *   tp:pd:prev:<panelId>             → Permission preview (read-only)
 *   tp:pd:edit:<panelId>:<section>   → Open edit modal for section
 *   tp:pd:modal:<panelId>:<section>  → Modal submit for section
 *   tp:pd:mperm:<panelId>:<key>      → Toggle one member permission
 *   tp:pd:sperm:<panelId>:<key>      → Toggle one staff permission
 *   tp:pd:setvis:<panelId>:<mode>    → Set visibility mode
 *   tp:pd:ctog:<panelId>:<field>     → Toggle one claim behaviour field
 *
 * Question/Form Builder (tp:frm:*) sub-namespace — replaces the old 5-question
 * `tp:q:*` UI. Panels created before this feature keep working via the
 * legacy `modal` data path (ticket-open flow only, no UI); `tp:q:*` IDs are
 * intentionally retired.
 *   tp:frm:<panelId>                        → Form Builder main (list of forms)
 *   tp:frm:new:<panelId>                    → template gallery for a new form
 *   tp:frm:new:use:<panelId>:<tplKey>        → create form from a built-in template
 *   tp:frm:detail:<panelId>:<formId>         → form detail (questions + actions)
 *   tp:frm:rename:<panelId>:<formId>         → rename/describe form modal
 *   tp:frm:rename:m:<panelId>:<formId>       → rename modal submit
 *   tp:frm:dup:<panelId>:<formId>            → duplicate form
 *   tp:frm:del:<panelId>:<formId>            → delete confirm
 *   tp:frm:del:yes:<panelId>:<formId>        → confirmed delete
 *   tp:frm:preview:<panelId>:<formId>        → preview (opens the real modal, nothing is saved)
 *   tp:frm:export:<panelId>:<formId>         → export form as a JSON file attachment
 *   tp:frm:import:<panelId>                  → show import-JSON modal
 *   tp:frm:import:m:<panelId>                → import modal submit
 *   tp:frm:assign:<panelId>:<formId>         → select menu: which button/option opens this form
 *   tp:frm:chain:<panelId>:<formId>          → chaining (next form) settings view
 *   tp:frm:chain:set:<panelId>:<formId>      → show modal to edit chaining rule
 *   tp:frm:chain:m:<panelId>:<formId>        → chaining modal submit
 *   tp:frm:fs:<panelId>                      → select menu: pick a form (main page)
 *   tp:frm:q:add:<panelId>:<formId>          → question-type picker (select menu)
 *   tp:frm:q:addtype:<panelId>:<formId>      → question-type select menu customId
 *   tp:frm:q:add:m:<panelId>:<formId>:<type> → add-question modal submit
 *   tp:frm:q:detail:<panelId>:<formId>:<idx> → question detail view
 *   tp:frm:q:basic:<panelId>:<formId>:<idx>  → edit title/placeholder/default modal
 *   tp:frm:q:basic:m:<panelId>:<formId>:<idx>→ basic modal submit
 *   tp:frm:q:desc:<panelId>:<formId>:<idx>   → edit description modal
 *   tp:frm:q:desc:m:<panelId>:<formId>:<idx> → description modal submit
 *   tp:frm:q:len:<panelId>:<formId>:<idx>    → edit min/max length modal
 *   tp:frm:q:len:m:<panelId>:<formId>:<idx>  → length modal submit
 *   tp:frm:q:val:<panelId>:<formId>:<idx>    → edit validation regex/error modal
 *   tp:frm:q:val:m:<panelId>:<formId>:<idx>  → validation modal submit
 *   tp:frm:q:req:<panelId>:<formId>:<idx>    → toggle required
 *   tp:frm:q:up:<panelId>:<formId>:<idx>     → move question up
 *   tp:frm:q:down:<panelId>:<formId>:<idx>   → move question down
 *   tp:frm:q:rm:<panelId>:<formId>:<idx>     → remove question
 *   tp:frm:qs:<panelId>:<formId>             → select menu: pick a question
 *   tp:frm:qc:<panelId>:<formId>:<idx>       → conditional (showIf) editor view
 *   tp:frm:qc:pick:<panelId>:<formId>:<idx>  → select menu: pick source question
 *   tp:frm:qc:m:<panelId>:<formId>:<idx>:<srcQId> → modal: enter "equals" value
 *   tp:frm:qc:clear:<panelId>:<formId>:<idx> → clear condition
 *
 * Ticket Type Designer (tp:tt:*) sub-namespace — every button/select-option is
 * a fully independent "ticket type" that can own its own categories, roles,
 * permissions, naming, limits, lifecycle, transcript, statistics and embed,
 * falling back to the panel's own value field-by-field when unset. `ref` is a
 * stable entry reference: 'b' = primary button, 'x<idx>' = extra button,
 * 's<idx>' = select menu option (see `TicketEntryRef` in types.ts).
 *   tp:tt:<panelId>:<ref>                     → Ticket Type Designer hub
 *   tp:tt:cat:<panelId>:<ref>                 → Categories & logging page
 *   tp:tt:roles:<panelId>:<ref>                → Support/manager/admin/ping roles page
 *   tp:tt:access:<panelId>:<ref>               → Allowed/blocked roles & users page
 *   tp:tt:mperms:<panelId>:<ref>               → Member permission toggles
 *   tp:tt:sperms:<panelId>:<ref>               → Staff permission toggles
 *   tp:tt:vis:<panelId>:<ref>                  → Visibility mode selector
 *   tp:tt:claim:<panelId>:<ref>                → Claim behaviour toggles
 *   tp:tt:naming:<panelId>:<ref>                → Naming scheme & limits page
 *   tp:tt:auto:<panelId>:<ref>                  → Automation page
 *   tp:tt:tx:<panelId>:<ref>                    → Transcript page
 *   tp:tt:stats:<panelId>:<ref>                 → Statistics page
 *   tp:tt:embed:<panelId>:<ref>                 → Welcome embed page
 *   tp:tt:edit:<panelId>:<ref>:<section>        → Open edit modal for a section
 *   tp:tt:modal:<panelId>:<ref>:<section>       → Modal submit for a section
 *   tp:tt:mperm:<panelId>:<ref>:<key>           → Toggle one member permission override
 *   tp:tt:sperm:<panelId>:<ref>:<key>           → Toggle one staff permission override
 *   tp:tt:setvis:<panelId>:<ref>:<mode>         → Set visibility override
 *   tp:tt:ctog:<panelId>:<ref>:<field>          → Toggle one claim behaviour field
 *   tp:tt:reset:<panelId>:<ref>:<section>       → Clear a section's override back to panel default
 */

export type SectionKey =
  | 'general'
  | 'appearance'
  | 'button'
  | 'permissions'
  | 'forms'
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

  panelSelect:  (offset: number): string         => `tp:ps:${offset}`,
  extraBtnSel:  (panelId: string): string        => `tp:ebs:${panelId}`,
  smOptSel:     (panelId: string): string        => `tp:sos:${panelId}`,

  // ── Template Gallery ─────────────────────────────────────────────────────
  GALLERY:      'tp:gallery',
  tplDetail:    (tplId: string): string          => `tp:tpl:detail:${tplId}`,
  tplUse:       (tplId: string): string          => `tp:tpl:use:${tplId}`,
  tplUseM:      (tplId: string): string          => `tp:tpl:use:m:${tplId}`,
  tplSave:      (panelId: string): string        => `tp:tpl:save:${panelId}`,
  tplSaveM:     (panelId: string): string        => `tp:tpl:save:m:${panelId}`,
  tplDel:       (tplId: string): string          => `tp:tpl:del:${tplId}`,
  tplDelYes:    (tplId: string): string          => `tp:tpl:del:yes:${tplId}`,
  tgSel:        (offset: number): string         => `tp:tgs:${offset}`,

  // ── Permission Designer ──────────────────────────────────────────────────
  PD: {
    main:     (panelId: string): string                    => `tp:pd:${panelId}`,
    team:     (panelId: string): string                    => `tp:pd:team:${panelId}`,
    mperms:   (panelId: string): string                    => `tp:pd:mperms:${panelId}`,
    sperms:   (panelId: string): string                    => `tp:pd:sperms:${panelId}`,
    vis:      (panelId: string): string                    => `tp:pd:vis:${panelId}`,
    claim:    (panelId: string): string                    => `tp:pd:claim:${panelId}`,
    prev:     (panelId: string): string                    => `tp:pd:prev:${panelId}`,
    edit:     (panelId: string, section: string): string   => `tp:pd:edit:${panelId}:${section}`,
    pdModal:  (panelId: string, section: string): string   => `tp:pd:modal:${panelId}:${section}`,
    mperm:    (panelId: string, key: string): string       => `tp:pd:mperm:${panelId}:${key}`,
    sperm:    (panelId: string, key: string): string       => `tp:pd:sperm:${panelId}:${key}`,
    setvis:   (panelId: string, mode: string): string      => `tp:pd:setvis:${panelId}:${mode}`,
    ctog:     (panelId: string, field: string): string     => `tp:pd:ctog:${panelId}:${field}`,
  },

  // ── Question / Form Builder ──────────────────────────────────────────────
  FRM: {
    main:       (panelId: string): string                        => `tp:frm:${panelId}`,
    newGallery: (panelId: string): string                        => `tp:frm:new:${panelId}`,
    newUse:     (panelId: string, tplKey: string): string         => `tp:frm:new:use:${panelId}:${tplKey}`,
    detail:     (panelId: string, formId: string): string         => `tp:frm:detail:${panelId}:${formId}`,
    rename:     (panelId: string, formId: string): string         => `tp:frm:rename:${panelId}:${formId}`,
    renameM:    (panelId: string, formId: string): string         => `tp:frm:rename:m:${panelId}:${formId}`,
    dup:        (panelId: string, formId: string): string         => `tp:frm:dup:${panelId}:${formId}`,
    del:        (panelId: string, formId: string): string         => `tp:frm:del:${panelId}:${formId}`,
    delYes:     (panelId: string, formId: string): string         => `tp:frm:del:yes:${panelId}:${formId}`,
    preview:    (panelId: string, formId: string): string         => `tp:frm:preview:${panelId}:${formId}`,
    exportForm: (panelId: string, formId: string): string         => `tp:frm:export:${panelId}:${formId}`,
    importForm: (panelId: string): string                         => `tp:frm:import:${panelId}`,
    importM:    (panelId: string): string                         => `tp:frm:import:m:${panelId}`,
    assign:     (panelId: string, formId: string): string         => `tp:frm:assign:${panelId}:${formId}`,
    chain:      (panelId: string, formId: string): string         => `tp:frm:chain:${panelId}:${formId}`,
    chainSet:   (panelId: string, formId: string): string         => `tp:frm:chain:set:${panelId}:${formId}`,
    chainM:     (panelId: string, formId: string): string         => `tp:frm:chain:m:${panelId}:${formId}`,
    formSel:    (panelId: string): string                         => `tp:frm:fs:${panelId}`,

    qAdd:       (panelId: string, formId: string): string                     => `tp:frm:q:add:${panelId}:${formId}`,
    qAddType:   (panelId: string, formId: string): string                     => `tp:frm:q:addtype:${panelId}:${formId}`,
    qAddM:      (panelId: string, formId: string, type: string): string      => `tp:frm:q:add:m:${panelId}:${formId}:${type}`,
    qDetail:    (panelId: string, formId: string, idx: number): string       => `tp:frm:q:detail:${panelId}:${formId}:${idx}`,
    qBasic:     (panelId: string, formId: string, idx: number): string       => `tp:frm:q:basic:${panelId}:${formId}:${idx}`,
    qBasicM:    (panelId: string, formId: string, idx: number): string       => `tp:frm:q:basic:m:${panelId}:${formId}:${idx}`,
    qDesc:      (panelId: string, formId: string, idx: number): string       => `tp:frm:q:desc:${panelId}:${formId}:${idx}`,
    qDescM:     (panelId: string, formId: string, idx: number): string       => `tp:frm:q:desc:m:${panelId}:${formId}:${idx}`,
    qLen:       (panelId: string, formId: string, idx: number): string       => `tp:frm:q:len:${panelId}:${formId}:${idx}`,
    qLenM:      (panelId: string, formId: string, idx: number): string       => `tp:frm:q:len:m:${panelId}:${formId}:${idx}`,
    qVal:       (panelId: string, formId: string, idx: number): string       => `tp:frm:q:val:${panelId}:${formId}:${idx}`,
    qValM:      (panelId: string, formId: string, idx: number): string       => `tp:frm:q:val:m:${panelId}:${formId}:${idx}`,
    qReq:       (panelId: string, formId: string, idx: number): string       => `tp:frm:q:req:${panelId}:${formId}:${idx}`,
    qUp:        (panelId: string, formId: string, idx: number): string       => `tp:frm:q:up:${panelId}:${formId}:${idx}`,
    qDown:      (panelId: string, formId: string, idx: number): string       => `tp:frm:q:down:${panelId}:${formId}:${idx}`,
    qRm:        (panelId: string, formId: string, idx: number): string       => `tp:frm:q:rm:${panelId}:${formId}:${idx}`,
    qSel:       (panelId: string, formId: string): string                    => `tp:frm:qs:${panelId}:${formId}`,

    qCond:      (panelId: string, formId: string, idx: number): string       => `tp:frm:qc:${panelId}:${formId}:${idx}`,
    qCondPick:  (panelId: string, formId: string, idx: number): string       => `tp:frm:qc:pick:${panelId}:${formId}:${idx}`,
    qCondM:     (panelId: string, formId: string, idx: number, srcQId: string): string => `tp:frm:qc:m:${panelId}:${formId}:${idx}:${srcQId}`,
    qCondClear: (panelId: string, formId: string, idx: number): string       => `tp:frm:qc:clear:${panelId}:${formId}:${idx}`,
    assignSel:  (panelId: string, formId: string): string                    => `tp:frm:assignsel:${panelId}:${formId}`,
    prevModal:  (panelId: string, formId: string): string                    => `tp:frm:prevmodal:${panelId}:${formId}`,
  },

  // ── Ticket Type Designer ─────────────────────────────────────────────────
  TT: {
    main:     (panelId: string, ref: string): string                  => `tp:tt:${panelId}:${ref}`,
    cat:      (panelId: string, ref: string): string                  => `tp:tt:cat:${panelId}:${ref}`,
    roles:    (panelId: string, ref: string): string                  => `tp:tt:roles:${panelId}:${ref}`,
    access:   (panelId: string, ref: string): string                  => `tp:tt:access:${panelId}:${ref}`,
    mperms:   (panelId: string, ref: string): string                  => `tp:tt:mperms:${panelId}:${ref}`,
    sperms:   (panelId: string, ref: string): string                  => `tp:tt:sperms:${panelId}:${ref}`,
    vis:      (panelId: string, ref: string): string                  => `tp:tt:vis:${panelId}:${ref}`,
    claim:    (panelId: string, ref: string): string                  => `tp:tt:claim:${panelId}:${ref}`,
    naming:   (panelId: string, ref: string): string                  => `tp:tt:naming:${panelId}:${ref}`,
    auto:     (panelId: string, ref: string): string                  => `tp:tt:auto:${panelId}:${ref}`,
    tx:       (panelId: string, ref: string): string                  => `tp:tt:tx:${panelId}:${ref}`,
    stats:    (panelId: string, ref: string): string                  => `tp:tt:stats:${panelId}:${ref}`,
    embed:    (panelId: string, ref: string): string                  => `tp:tt:embed:${panelId}:${ref}`,
    edit:     (panelId: string, ref: string, section: string): string => `tp:tt:edit:${panelId}:${ref}:${section}`,
    ttModal:  (panelId: string, ref: string, section: string): string => `tp:tt:modal:${panelId}:${ref}:${section}`,
    mperm:    (panelId: string, ref: string, key: string): string     => `tp:tt:mperm:${panelId}:${ref}:${key}`,
    sperm:    (panelId: string, ref: string, key: string): string     => `tp:tt:sperm:${panelId}:${ref}:${key}`,
    setvis:   (panelId: string, ref: string, mode: string): string    => `tp:tt:setvis:${panelId}:${ref}:${mode}`,
    ctog:     (panelId: string, ref: string, field: string): string   => `tp:tt:ctog:${panelId}:${ref}:${field}`,
    reset:    (panelId: string, ref: string, section: string): string => `tp:tt:reset:${panelId}:${ref}:${section}`,
  },
} as const;

export function isTPInteraction(customId: string): boolean {
  return customId.startsWith('tp:');
}

export const SECTION_META: Record<SectionKey, { label: string; emoji: string }> = {
  general:     { label: 'General',     emoji: '⚙️' },
  appearance:  { label: 'Appearance',  emoji: '🎨' },
  button:      { label: 'Button',      emoji: '🔘' },
  permissions: { label: 'Permissions', emoji: '🔐' },
  forms:       { label: 'Forms',       emoji: '📝' },
  categories:  { label: 'Categories',  emoji: '📁' },
  naming:      { label: 'Naming',      emoji: '📝' },
  lifecycle:   { label: 'Lifecycle',   emoji: '🔄' },
  automation:  { label: 'Automation',  emoji: '🤖' },
  transcripts: { label: 'Transcripts', emoji: '📄' },
  stats:       { label: 'Statistics',  emoji: '📊' },
  publish:     { label: 'Publish',     emoji: '📤' },
};
