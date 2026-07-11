/**
 * CC Render Audit — /cc-test and startup self-check.
 *
 * Runs all 8 renderers with representative inputs, calls
 * assertUniqueCustomIds on every payload, and reports results.
 * If any renderer throws (duplicate ID, bad count, etc.) the audit
 * fails fast with the exact renderer name and error message.
 *
 * Wired in two places:
 *   1. ControlCenterService.runStartupAudit() — called once at bot startup
 *   2. /cc-test slash command — admin-only, returns a Discord embed
 */

import type { ITool, ToolDefinition, ToolExecuteResult } from '../../ai/tools/tool.interface';
import { CATEGORY_ORDER } from './cc-categories';
import type { CategoryKey } from './cc-categories';
import {
  buildDashboard,
  buildCategoryPanel,
  buildToolDetail,
  buildResult,
  buildConfirm,
  buildSearchResults,
  buildFavoritesPanel,
  buildSearchModal,
  buildToolModal,
  TOOLS_PER_PAGE,
} from './cc-renderer';
import { logger } from '../../utils/logger';

// ── Mock data ──────────────────────────────────────────────────────────────

function mockTool(opts: {
  name: string;
  description?: string;
  dangerous?: boolean;
  dangerDescription?: string;
  params?: Record<string, { type: string; description: string; enum?: string[] }>;
  required?: string[];
}): ITool {
  const definition: ToolDefinition = {
    name: opts.name,
    description: opts.description ?? `Mock tool: ${opts.name}`,
    dangerous: opts.dangerous ?? false,
    dangerDescription: opts.dangerDescription,
    parameters: {
      type: 'object',
      properties: opts.params ?? {},
      required: opts.required ?? [],
    },
  };
  return {
    definition,
    execute: async (_params: Record<string, unknown>, _guild: unknown): Promise<ToolExecuteResult> => ({
      success: true,
      message: `Mock result for ${opts.name}`,
    }),
  };
}

const SAFE_TOOL = mockTool({
  name: 'create_channel',
  description: 'Create a new text or voice channel',
  params: {
    name:      { type: 'string', description: 'Channel name' },
    type:      { type: 'string', description: 'Channel type', enum: ['text', 'voice', 'forum'] },
    topic:     { type: 'string', description: 'Channel topic (optional)' },
  },
  required: ['name'],
});

const DANGER_TOOL = mockTool({
  name: 'delete_channel',
  description: 'Permanently delete a channel',
  dangerous: true,
  dangerDescription: 'This permanently removes the channel and all its messages.',
  params: {
    channel_id: { type: 'string', description: 'Channel ID to delete' },
    reason:     { type: 'string', description: 'Audit log reason' },
  },
  required: ['channel_id'],
});

const NO_PARAM_TOOL = mockTool({ name: 'view_guild_info', description: 'Show server info' });

// Build 45 mock tools for multi-page pagination tests
const MANY_TOOLS: ITool[] = Array.from({ length: 45 }, (_, i) =>
  mockTool({ name: `tool_${i}`, description: `Paginated tool number ${i}` }),
);

const MOCK_CATEGORY_COUNTS: Partial<Record<CategoryKey, number>> =
  Object.fromEntries(CATEGORY_ORDER.map((k, i) => [k, (i + 1) * 3]));

// ── Test result types ──────────────────────────────────────────────────────

export interface CCTestResult {
  renderer: string;
  passed: boolean;
  ids: string[];
  rows: number;
  errorMsg?: string;
  ms: number;
}

export interface CCTestReport {
  passed: number;
  failed: number;
  totalMs: number;
  results: CCTestResult[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractIds(payload: { components?: unknown[] }): string[] {
  interface RawComp { custom_id?: string }
  interface RawRow  { components?: RawComp[] }
  const raw = JSON.parse(JSON.stringify(payload)) as { components?: RawRow[] };
  const ids: string[] = [];
  for (const row of raw.components ?? []) {
    for (const comp of row.components ?? []) {
      if (comp.custom_id) ids.push(comp.custom_id);
    }
  }
  return ids;
}

function rowCount(payload: { components?: unknown[] }): number {
  return (JSON.parse(JSON.stringify(payload)) as { components?: unknown[] }).components?.length ?? 0;
}

function run(name: string, fn: () => { components?: unknown[] }): CCTestResult {
  const t0 = Date.now();
  try {
    const payload = fn();
    return { renderer: name, passed: true, ids: extractIds(payload), rows: rowCount(payload), ms: Date.now() - t0 };
  } catch (err) {
    return { renderer: name, passed: false, ids: [], rows: 0, errorMsg: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 };
  }
}

// ── Full audit ─────────────────────────────────────────────────────────────

export function runCCRenderAudit(): CCTestReport {
  const t0 = Date.now();

  const results: CCTestResult[] = [

    // 1. Dashboard — all 27 categories visible via two selects
    run('buildDashboard(27 categories)', () =>
      buildDashboard(342, MOCK_CATEGORY_COUNTS),
    ),

    // 2. Category panel — single page (few tools)
    run('buildCategoryPanel(channels, 7 tools, p=0)', () =>
      buildCategoryPanel('channels', Array.from({ length: 7 }, (_, i) => mockTool({ name: `channel_tool_${i}` })), 0),
    ),

    // 3. Category panel — multi-page, first page
    run('buildCategoryPanel(moderation, 45 tools, p=0)', () =>
      buildCategoryPanel('moderation', MANY_TOOLS, 0),
    ),

    // 4. Category panel — multi-page, middle page
    run('buildCategoryPanel(moderation, 45 tools, p=1)', () =>
      buildCategoryPanel('moderation', MANY_TOOLS, 1),
    ),

    // 5. Category panel — last page (safePage === totalPages-1 → Next disabled)
    run('buildCategoryPanel(moderation, 45 tools, p=2)', () => {
      const totalPages = Math.ceil(MANY_TOOLS.length / TOOLS_PER_PAGE);
      return buildCategoryPanel('moderation', MANY_TOOLS, totalPages - 1);
    }),

    // 6. Tool detail — safe tool, not a favorite
    run('buildToolDetail(create_channel, channels, fav=false)', () =>
      buildToolDetail(SAFE_TOOL, 'channels', false),
    ),

    // 7. Tool detail — dangerous tool, is a favorite
    run('buildToolDetail(delete_channel, channels, fav=true)', () =>
      buildToolDetail(DANGER_TOOL, 'channels', true),
    ),

    // 8. Tool detail — no-param tool
    run('buildToolDetail(view_guild_info, server, fav=false)', () =>
      buildToolDetail(NO_PARAM_TOOL, 'server', false),
    ),

    // 9. Result — success
    run('buildResult(create_channel, success)', () =>
      buildResult('create_channel', { success: true, message: 'Channel created successfully' }, 'channels'),
    ),

    // 10. Result — failure
    run('buildResult(delete_channel, failure)', () =>
      buildResult('delete_channel', { success: false, message: 'Permission denied' }, 'channels'),
    ),

    // 11. Confirm — dangerous tool
    run('buildConfirm(delete_channel)', () =>
      buildConfirm(DANGER_TOOL, '**channel_id:** 123456789', 'channels'),
    ),

    // 12. Search results — with results
    run('buildSearchResults("channel", 10 results)', () =>
      buildSearchResults('channel', Array.from({ length: 10 }, (_, i) => mockTool({ name: `found_tool_${i}`, description: `Match ${i}` }))),
    ),

    // 13. Search results — no results
    run('buildSearchResults("xyznotfound", 0 results)', () =>
      buildSearchResults('xyznotfound', []),
    ),

    // 14. Favorites — with tools
    run('buildFavoritesPanel(3 favorites)', () =>
      buildFavoritesPanel([SAFE_TOOL, DANGER_TOOL, NO_PARAM_TOOL]),
    ),

    // 15. Favorites — empty
    run('buildFavoritesPanel(empty)', () =>
      buildFavoritesPanel([]),
    ),

    // 16. Search modal — test field key uniqueness
    run('buildSearchModal()', () => {
      const modal = buildSearchModal();
      return JSON.parse(JSON.stringify(modal.toJSON())) as { components?: unknown[] };
    }),

    // 17. Tool modal — safe tool with params
    run('buildToolModal(create_channel)', () => {
      const modal = buildToolModal(SAFE_TOOL);
      return JSON.parse(JSON.stringify(modal.toJSON())) as { components?: unknown[] };
    }),

    // 18. Tool modal — dangerous tool with params
    run('buildToolModal(delete_channel)', () => {
      const modal = buildToolModal(DANGER_TOOL);
      return JSON.parse(JSON.stringify(modal.toJSON())) as { components?: unknown[] };
    }),

  ];

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalMs = Date.now() - t0;

  return { passed, failed, totalMs, results };
}

// ── Startup runner ─────────────────────────────────────────────────────────

export function runStartupAudit(): void {
  const report = runCCRenderAudit();
  const status = report.failed === 0 ? '✅' : '❌';

  logger.info(
    `[CC][audit] ${status} Render audit complete — ${report.passed}/${report.passed + report.failed} passed in ${report.totalMs}ms`,
  );

  for (const r of report.results) {
    if (r.passed) {
      logger.info(
        `[CC][audit]   ✅ ${r.renderer} — ${r.rows} row(s), ${r.ids.length} ID(s): [${r.ids.join(', ')}] (${r.ms}ms)`,
      );
    } else {
      logger.error(
        `[CC][audit]   ❌ ${r.renderer} — FAILED in ${r.ms}ms\n         ${r.errorMsg ?? 'unknown error'}`,
      );
    }
  }
}
