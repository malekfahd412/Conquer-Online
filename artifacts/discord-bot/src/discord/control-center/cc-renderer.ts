import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { ITool, ToolDefinition, ToolExecuteResult } from '../../ai/tools/tool.interface';
import { CATEGORY_META, CATEGORY_ORDER, toolDisplayName, truncate } from './cc-categories';
import type { CategoryKey } from './cc-categories';
import { CC } from './cc-ids';
import { checkColor, checkButtonStyle, checkCount, checkPageIndex, checkTextInputLength, verifyBuilder, assertUniqueCustomIds } from './cc-debug';
import { logger } from '../../utils/logger';

const FILE = 'cc-renderer.ts';

export const TOOLS_PER_PAGE = 20;
export const MAX_SELECT_OPTIONS = 25;

export type ButtonRow = ActionRowBuilder<ButtonBuilder>;
export type SelectRow = ActionRowBuilder<StringSelectMenuBuilder>;
export type AnyRow = ButtonRow | SelectRow;

export interface CCPayload {
  content: string;
  embeds: EmbedBuilder[];
  components: AnyRow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function btn(label: string, customId: string, style: ButtonStyle, disabled = false): ButtonBuilder {
  const safeStyle = checkButtonStyle(FILE, 'btn', `style(${customId})`, style);
  return verifyBuilder(FILE, 'btn', `button:${customId}`, () =>
    new ButtonBuilder().setLabel(label).setCustomId(customId).setStyle(safeStyle).setDisabled(disabled),
  );
}

function homeBtn(): ButtonBuilder   { return btn('🏠 Home',      CC.HOME,  ButtonStyle.Secondary); }
function favBtn(): ButtonBuilder    { return btn('⭐ Favorites', CC.FAVS,  ButtonStyle.Secondary); }
function searchBtn(): ButtonBuilder { return btn('🔍 Search',    CC.SRCH,  ButtonStyle.Secondary); }

// ── Dashboard ──────────────────────────────────────────────────────────────
//
// Discord hard-limits a StringSelectMenu to 25 options. We have 27 categories.
// Solution: two select menus (cc:cs + cc:cs2), each ≤ 25, total 3 rows.

const HALF = Math.ceil(CATEGORY_ORDER.length / 2);

export function buildDashboard(toolCount: number, categoryToolCounts: Partial<Record<CategoryKey, number>>): CCPayload {
  const fn = 'buildDashboard';
  const color = checkColor(FILE, fn, 'embedColor', 0x5865f2);
  checkCount(FILE, fn, 'toolCount', toolCount, Number.MAX_SAFE_INTEGER, 0);

  const embed = verifyBuilder(FILE, fn, 'dashboard embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle('🎛️ Discord Control Center')
      .setDescription(
        `Select a category to browse and execute tools interactively.\n` +
        `All **${toolCount}** tools are available — no AI required for most actions.`,
      )
      .addFields(
        { name: '🔧 Total Tools',   value: String(toolCount),          inline: true },
        { name: '📁 Categories',    value: String(CATEGORY_ORDER.length), inline: true },
        { name: '💡 Tip',           value: 'Use **🔍 Search** to find any tool instantly', inline: false },
      )
      .setFooter({ text: 'AI is still available via /ai for complex multi-step tasks' }),
  );

  function makeSelect(id: string, slice: CategoryKey[]): ActionRowBuilder<StringSelectMenuBuilder> {
    const count = checkCount(FILE, fn, `${id}.options`, slice.length, MAX_SELECT_OPTIONS, MAX_SELECT_OPTIONS);
    const select = verifyBuilder(FILE, fn, `select:${id}`, () =>
      new StringSelectMenuBuilder()
        .setCustomId(id)
        .setPlaceholder('📁 Choose a category...')
        .addOptions(
          slice.slice(0, count).map(key => {
            const meta = CATEGORY_META[key];
            const n = categoryToolCounts[key] ?? 0;
            return new StringSelectMenuOptionBuilder()
              .setLabel(`${meta.emoji} ${meta.label}`)
              .setDescription(truncate(`${n} tools — ${meta.description}`, 100))
              .setValue(key);
          }),
        ),
    );
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  }

  const part1 = CATEGORY_ORDER.slice(0, HALF);
  const part2 = CATEGORY_ORDER.slice(HALF);

  const payload: CCPayload = {
    content: '',
    embeds: [embed],
    components: [
      makeSelect(CC.CAT_SELECT, part1),
      makeSelect(CC.CAT_SELECT2, part2),
      new ActionRowBuilder<ButtonBuilder>().addComponents(favBtn(), searchBtn()),
    ],
  };
  assertUniqueCustomIds('buildDashboard', payload);
  return payload;
}

// ── Category Panel ─────────────────────────────────────────────────────────

export function buildCategoryPanel(category: CategoryKey, tools: ITool[], page: number): CCPayload {
  const fn = 'buildCategoryPanel';
  const meta = CATEGORY_META[category];
  const total = tools.length;
  const totalPages = Math.max(1, Math.ceil(total / TOOLS_PER_PAGE));

  const safePage = checkPageIndex(FILE, fn, `page(${category})`, page, totalPages - 1);
  const color = checkColor(FILE, fn, `categoryColor(${category})`, meta.color);

  const slice = tools.slice(safePage * TOOLS_PER_PAGE, (safePage + 1) * TOOLS_PER_PAGE);
  const optionCount = checkCount(FILE, fn, `optionCount(${category})`, slice.length, MAX_SELECT_OPTIONS, MAX_SELECT_OPTIONS);
  const slicedOptions = slice.slice(0, optionCount);

  const embed = verifyBuilder(FILE, fn, `category embed:${category}`, () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`${meta.emoji} ${meta.label}`)
      .setDescription(`${meta.description}\n\n${total} tool${total !== 1 ? 's' : ''} — Page ${safePage + 1}/${totalPages}`)
      .setFooter({ text: 'Select a tool below to view details and execute it' }),
  );

  const select = verifyBuilder(FILE, fn, `category select:${category}`, () =>
    new StringSelectMenuBuilder()
      .setCustomId(CC.toolSelect(category, safePage))
      .setPlaceholder('⚡ Choose a tool...')
      .addOptions(
        slicedOptions.map(tool => {
          const d = tool.definition;
          const label = truncate(`${d.dangerous ? '⚠️ ' : ''}${toolDisplayName(d.name)}`, 100);
          const desc = truncate(d.description, 100);
          return new StringSelectMenuOptionBuilder().setLabel(label).setDescription(desc).setValue(d.name);
        }),
      ),
  );

  // Use RAW unclamped page numbers as button custom IDs — never clamp before
  // passing here. When totalPages===1: prev=-1, next=+1 → always unique.
  // The router's navToCategory clamps after parsing.
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    homeBtn(),
    btn('◀ Prev', CC.page(category, safePage - 1), ButtonStyle.Secondary, safePage === 0),
    btn('Next ▶', CC.page(category, safePage + 1), ButtonStyle.Secondary, safePage >= totalPages - 1),
    favBtn(),
    searchBtn(),
  );

  const payload: CCPayload = {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      navRow,
    ],
  };
  assertUniqueCustomIds(`buildCategoryPanel(${category},p${safePage})`, payload);
  return payload;
}

// ── Tool Detail ────────────────────────────────────────────────────────────

export function buildToolDetail(tool: ITool, category: CategoryKey, isFav: boolean): CCPayload {
  const fn = 'buildToolDetail';
  const d: ToolDefinition = tool.definition;
  const meta = CATEGORY_META[category];
  const hasRollback = typeof tool.rollback === 'function';

  const required = d.parameters.required ?? [];
  const props = d.parameters.properties ?? {};

  const paramLines = Object.entries(props).map(([key, schema]) => {
    const req = required.includes(key) ? '**required**' : 'optional';
    const enumNote = schema.enum ? ` (${schema.enum.join('|')})` : '';
    return `• \`${key}\` — ${schema.type}${enumNote}, ${req} — ${schema.description}`;
  });

  const color = checkColor(FILE, fn, `toolColor(${d.name})`, d.dangerous ? 0xed4245 : meta.color);

  const embed = verifyBuilder(FILE, fn, `tool detail embed:${d.name}`, () => {
    const e = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${d.dangerous ? '⚠️' : '⚡'} ${toolDisplayName(d.name)}`)
      .setDescription(d.description)
      .addFields(
        { name: `📝 Parameters (${Object.keys(props).length})`, value: paramLines.length ? truncate(paramLines.join('\n'), 1024) : '_No parameters required_', inline: false },
      );

    if (d.dangerous && d.dangerDescription) {
      e.addFields({ name: '⚠️ Warning', value: d.dangerDescription, inline: false });
    }
    if (hasRollback) {
      e.addFields({ name: '↩️ Rollback', value: 'This action can be rolled back after execution.', inline: false });
    }
    e.setFooter({ text: `Category: ${meta.emoji} ${meta.label}` });
    return e;
  });

  const execLabel = d.dangerous ? '⚠️ Execute (Dangerous)' : '⚡ Execute';
  const execStyle = checkButtonStyle(FILE, fn, `execStyle(${d.name})`, d.dangerous ? ButtonStyle.Danger : ButtonStyle.Success);
  const favLabel = isFav ? '★ Unfavorite' : '☆ Favorite';

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(execLabel,        CC.exec(d.name),    execStyle),
    btn(favLabel,         CC.fav(d.name),     ButtonStyle.Secondary),
    btn(`← ${meta.label}`, CC.cat(category), ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row1] };
  assertUniqueCustomIds(`buildToolDetail(${d.name})`, payload);
  return payload;
}

// ── Result ─────────────────────────────────────────────────────────────────

export function buildResult(toolName: string, result: ToolExecuteResult, category: CategoryKey): CCPayload {
  const fn = 'buildResult';
  const color = checkColor(FILE, fn, `resultColor(${toolName})`, result.success ? 0x57f287 : 0xed4245);

  const embed = verifyBuilder(FILE, fn, `result embed:${toolName}`, () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`${result.success ? '✅' : '❌'} ${toolDisplayName(toolName)}`)
      .setDescription(truncate(result.message, 2000)),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('🔁 Run Again',    CC.exec(toolName), ButtonStyle.Primary),
    btn('← Back to Tool', CC.tool(toolName), ButtonStyle.Secondary),
    btn('← Category',     CC.cat(category),  ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds(`buildResult(${toolName})`, payload);
  return payload;
}

// ── Confirm (dangerous action) ─────────────────────────────────────────────

export function buildConfirm(tool: ITool, paramSummary: string, category: CategoryKey): CCPayload {
  const fn = 'buildConfirm';
  const d = tool.definition;
  const color = checkColor(FILE, fn, `confirmColor(${d.name})`, 0xf5a623);

  const embed = verifyBuilder(FILE, fn, `confirm embed:${d.name}`, () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`⚠️ Confirm: ${toolDisplayName(d.name)}`)
      .setDescription(d.dangerDescription ?? 'This action may be irreversible. Please confirm.')
      .addFields(
        { name: '📋 Parameters', value: paramSummary || '_None_', inline: false },
      )
      .setFooter({ text: 'This action cannot be undone' }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✅ Confirm & Execute', CC.doExec(d.name), ButtonStyle.Danger),
    btn('✖ Cancel',            CC.cat(category),   ButtonStyle.Secondary),
    homeBtn(),
  );

  const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
  assertUniqueCustomIds(`buildConfirm(${d.name})`, payload);
  return payload;
}

// ── Search Results ─────────────────────────────────────────────────────────

export function buildSearchResults(query: string, tools: ITool[]): CCPayload {
  const fn = 'buildSearchResults';

  if (tools.length === 0) {
    const color = checkColor(FILE, fn, 'noResultsColor', 0xed4245);
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('🔍 No Results')
      .setDescription(`No tools matched **"${query}"**.\n\nTry a shorter term like \`role\`, \`ban\`, \`channel\`, \`backup\`.`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(homeBtn(), searchBtn());
    const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
    assertUniqueCustomIds(`buildSearchResults:empty`, payload);
    return payload;
  }

  const color = checkColor(FILE, fn, 'resultsColor', 0x5865f2);
  const optionCount = checkCount(FILE, fn, 'shownCount', Math.min(tools.length, TOOLS_PER_PAGE), MAX_SELECT_OPTIONS, MAX_SELECT_OPTIONS);
  const shown = tools.slice(0, optionCount);

  const embed = verifyBuilder(FILE, fn, 'search results embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`🔍 "${query}" — ${tools.length} result${tools.length !== 1 ? 's' : ''}`)
      .setDescription(tools.length > TOOLS_PER_PAGE ? `Showing first ${TOOLS_PER_PAGE} of ${tools.length} results.` : ''),
  );

  const select = verifyBuilder(FILE, fn, 'search results select', () =>
    new StringSelectMenuBuilder()
      .setCustomId(CC.SEARCH_SELECT)
      .setPlaceholder('Select a result to view...')
      .addOptions(
        shown.map(tool => {
          const d = tool.definition;
          return new StringSelectMenuOptionBuilder()
            .setLabel(truncate(`${d.dangerous ? '⚠️ ' : ''}${toolDisplayName(d.name)}`, 100))
            .setDescription(truncate(d.description, 100))
            .setValue(d.name);
        }),
      ),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(homeBtn(), searchBtn());

  const payload: CCPayload = {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      row,
    ],
  };
  assertUniqueCustomIds(`buildSearchResults("${query}")`, payload);
  return payload;
}

// ── Favorites ──────────────────────────────────────────────────────────────

export function buildFavoritesPanel(tools: ITool[]): CCPayload {
  const fn = 'buildFavoritesPanel';
  const color = checkColor(FILE, fn, 'favoritesColor', 0xfee75c);

  if (tools.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('⭐ Favorites')
      .setDescription('You have no favorites yet.\nBrowse a tool and click **☆ Favorite** to pin it here.');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(homeBtn(), searchBtn());
    const payload: CCPayload = { content: '', embeds: [embed], components: [row] };
    assertUniqueCustomIds('buildFavoritesPanel:empty', payload);
    return payload;
  }

  const optionCount = checkCount(FILE, fn, 'favoritesShownCount', Math.min(tools.length, TOOLS_PER_PAGE), MAX_SELECT_OPTIONS, MAX_SELECT_OPTIONS);

  const embed = verifyBuilder(FILE, fn, 'favorites embed', () =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(`⭐ Favorites — ${tools.length} tool${tools.length !== 1 ? 's' : ''}`)
      .setDescription('Your pinned tools for quick access.'),
  );

  const select = verifyBuilder(FILE, fn, 'favorites select', () =>
    new StringSelectMenuBuilder()
      .setCustomId(CC.FAVS_SELECT)
      .setPlaceholder('Open a favorite tool...')
      .addOptions(
        tools.slice(0, optionCount).map(tool => {
          const d = tool.definition;
          return new StringSelectMenuOptionBuilder()
            .setLabel(truncate(toolDisplayName(d.name), 100))
            .setDescription(truncate(d.description, 100))
            .setValue(d.name);
        }),
      ),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(homeBtn(), searchBtn());

  const payload: CCPayload = {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      row,
    ],
  };
  assertUniqueCustomIds('buildFavoritesPanel', payload);
  return payload;
}

// ── Modals ─────────────────────────────────────────────────────────────────

export function buildToolModal(tool: ITool): ModalBuilder {
  const fn = 'buildToolModal';
  const d = tool.definition;
  const props = d.parameters.properties ?? {};
  const required = d.parameters.required ?? [];

  const sorted = [
    ...Object.entries(props).filter(([k]) => required.includes(k)),
    ...Object.entries(props).filter(([k]) => !required.includes(k)),
  ].slice(0, 5);

  const modal = verifyBuilder(FILE, fn, `modal shell:${d.name}`, () =>
    new ModalBuilder()
      .setCustomId(CC.modal(d.name))
      .setTitle(truncate(`Execute: ${toolDisplayName(d.name)}`, 45)),
  );

  for (const [key, schema] of sorted) {
    const isLong = /content|description|reason|message|topic|text|body|json/.test(key);
    const isRequired = required.includes(key);
    const enumHint = schema.enum ? `Options: ${schema.enum.join(', ')}` : '';
    const placeholder = truncate(enumHint || schema.description, 100);

    const input = verifyBuilder(FILE, fn, `text input:${d.name}.${key}`, () =>
      new TextInputBuilder()
        .setCustomId(key)
        .setLabel(truncate(toolDisplayName(key), 45))
        .setStyle(isLong ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setPlaceholder(placeholder)
        .setRequired(isRequired),
    );

    // Only apply min/maxLength for string-typed fields. For number/integer fields,
    // schema.minimum/maximum are VALUE bounds (e.g. slowmode 0-21600), not char counts.
    if (schema.type === 'string') {
      if (schema.minimum !== undefined) {
        const safeMin = checkTextInputLength(FILE, fn, `minLength(${d.name}.${key})`, schema.minimum, 0);
        input.setMinLength(safeMin);
      }
      if (schema.maximum !== undefined) {
        const safeMax = checkTextInputLength(FILE, fn, `maxLength(${d.name}.${key})`, schema.maximum, 4000);
        input.setMaxLength(safeMax);
      }
    } else if (schema.minimum !== undefined || schema.maximum !== undefined) {
      logger.info(
        `[CC][debug] ${FILE}::${fn} skipping length constraint for non-string field "${key}" ` +
        `(type=${schema.type}) — these are value bounds, not char limits.`,
      );
    }

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  return modal;
}

export function buildSearchModal(): ModalBuilder {
  const fn = 'buildSearchModal';
  const minLen = checkTextInputLength(FILE, fn, 'searchMinLength', 1, 0);
  const maxLen = checkTextInputLength(FILE, fn, 'searchMaxLength', 100, 100);

  const input = verifyBuilder(FILE, fn, 'search text input', () =>
    new TextInputBuilder()
      .setCustomId('query')
      .setLabel('Search Query')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. ban, create channel, backup, role...')
      .setRequired(true)
      .setMinLength(minLen)
      .setMaxLength(maxLen),
  );

  return new ModalBuilder()
    .setCustomId(CC.SEARCH_SUBMIT)
    .setTitle('🔍 Search Tools')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}
