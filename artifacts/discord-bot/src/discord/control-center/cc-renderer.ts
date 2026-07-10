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

export const TOOLS_PER_PAGE = 20;

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
  return new ButtonBuilder().setLabel(label).setCustomId(customId).setStyle(style).setDisabled(disabled);
}

function homeBtn(): ButtonBuilder { return btn('🏠 Home', 'cc:home', ButtonStyle.Secondary); }
function favBtn(): ButtonBuilder  { return btn('⭐ Favorites', 'cc:favs', ButtonStyle.Secondary); }
function searchBtn(): ButtonBuilder { return btn('🔍 Search', 'cc:srch', ButtonStyle.Secondary); }

// ── Dashboard ──────────────────────────────────────────────────────────────

export function buildDashboard(toolCount: number, categoryToolCounts: Partial<Record<CategoryKey, number>>): CCPayload {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎛️ Discord Control Center')
    .setDescription('Select a category to browse and execute tools interactively.\nAll 323 tools are available — no AI required for most actions.')
    .addFields(
      { name: '🔧 Total Tools', value: String(toolCount), inline: true },
      { name: '📁 Categories', value: String(CATEGORY_ORDER.length), inline: true },
      { name: '💡 Tip', value: 'Use **🔍 Search** to find any tool instantly', inline: false },
    )
    .setFooter({ text: 'AI is still available via /ai for complex multi-step tasks' });

  const select = new StringSelectMenuBuilder()
    .setCustomId('cc:cs')
    .setPlaceholder('📁 Choose a category...')
    .addOptions(
      CATEGORY_ORDER.map(key => {
        const meta = CATEGORY_META[key];
        const count = categoryToolCounts[key] ?? 0;
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${meta.emoji} ${meta.label}`)
          .setDescription(truncate(`${count} tools — ${meta.description}`, 100))
          .setValue(key);
      }),
    );

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(favBtn(), searchBtn()),
    ],
  };
}

// ── Category Panel ─────────────────────────────────────────────────────────

export function buildCategoryPanel(category: CategoryKey, tools: ITool[], page: number): CCPayload {
  const meta = CATEGORY_META[category];
  const total = tools.length;
  const totalPages = Math.max(1, Math.ceil(total / TOOLS_PER_PAGE));
  const slice = tools.slice(page * TOOLS_PER_PAGE, (page + 1) * TOOLS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} ${meta.label}`)
    .setDescription(`${meta.description}\n\n${total} tool${total !== 1 ? 's' : ''} — Page ${page + 1}/${totalPages}`)
    .setFooter({ text: 'Select a tool below to view details and execute it' });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`cc:ts:${category}:${page}`)
    .setPlaceholder('⚡ Choose a tool...')
    .addOptions(
      slice.map(tool => {
        const d = tool.definition;
        const label = truncate(`${d.dangerous ? '⚠️ ' : ''}${toolDisplayName(d.name)}`, 100);
        const desc = truncate(d.description, 100);
        return new StringSelectMenuOptionBuilder().setLabel(label).setDescription(desc).setValue(d.name);
      }),
    );

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    homeBtn(),
    btn('◀ Prev', `cc:pg:${category}:${page - 1}`, ButtonStyle.Secondary, page === 0),
    btn('Next ▶', `cc:pg:${category}:${page + 1}`, ButtonStyle.Secondary, page >= totalPages - 1),
    favBtn(),
    searchBtn(),
  );

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      navRow,
    ],
  };
}

// ── Tool Detail ────────────────────────────────────────────────────────────

export function buildToolDetail(tool: ITool, category: CategoryKey, isFav: boolean): CCPayload {
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

  const embed = new EmbedBuilder()
    .setColor(d.dangerous ? 0xed4245 : meta.color)
    .setTitle(`${d.dangerous ? '⚠️' : '⚡'} ${toolDisplayName(d.name)}`)
    .setDescription(d.description)
    .addFields(
      { name: `📝 Parameters (${Object.keys(props).length})`, value: paramLines.length ? truncate(paramLines.join('\n'), 1024) : '_No parameters required_', inline: false },
    );

  if (d.dangerous && d.dangerDescription) {
    embed.addFields({ name: '⚠️ Warning', value: d.dangerDescription, inline: false });
  }
  if (hasRollback) {
    embed.addFields({ name: '↩️ Rollback', value: 'This action can be rolled back after execution.', inline: false });
  }

  embed.setFooter({ text: `Category: ${meta.emoji} ${meta.label}` });

  const execLabel = d.dangerous ? '⚠️ Execute (Dangerous)' : '⚡ Execute';
  const execStyle = d.dangerous ? ButtonStyle.Danger : ButtonStyle.Success;
  const favLabel = isFav ? '★ Unfavorite' : '☆ Favorite';

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(execLabel, `cc:exec:${d.name}`, execStyle),
    btn(favLabel, `cc:fav:${d.name}`, ButtonStyle.Secondary),
    btn(`← ${meta.label}`, `cc:cat:${category}`, ButtonStyle.Secondary),
    homeBtn(),
  );

  return { content: '', embeds: [embed], components: [row1] };
}

// ── Result ─────────────────────────────────────────────────────────────────

export function buildResult(toolName: string, result: ToolExecuteResult, category: CategoryKey): CCPayload {
  const embed = new EmbedBuilder()
    .setColor(result.success ? 0x57f287 : 0xed4245)
    .setTitle(`${result.success ? '✅' : '❌'} ${toolDisplayName(toolName)}`)
    .setDescription(truncate(result.message, 2000));

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('🔁 Run Again', `cc:exec:${toolName}`, ButtonStyle.Primary),
    btn('← Back to Tool', `cc:tool:${toolName}`, ButtonStyle.Secondary),
    btn('← Category', `cc:cat:${category}`, ButtonStyle.Secondary),
    homeBtn(),
  );

  return { content: '', embeds: [embed], components: [row] };
}

// ── Confirm (dangerous, no-param tools) ───────────────────────────────────

export function buildConfirm(tool: ITool, paramSummary: string, category: CategoryKey): CCPayload {
  const d = tool.definition;
  const embed = new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle(`⚠️ Confirm: ${toolDisplayName(d.name)}`)
    .setDescription(d.dangerDescription ?? 'This action may be irreversible. Please confirm.')
    .addFields(
      { name: '📋 Parameters', value: paramSummary || '_None_', inline: false },
    )
    .setFooter({ text: 'This action cannot be undone' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn('✅ Confirm & Execute', `cc:do:${d.name}`, ButtonStyle.Danger),
    btn('✖ Cancel', `cc:cat:${category}`, ButtonStyle.Secondary),
    homeBtn(),
  );

  return { content: '', embeds: [embed], components: [row] };
}

// ── Search Results ─────────────────────────────────────────────────────────

export function buildSearchResults(query: string, tools: ITool[]): CCPayload {
  if (tools.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('🔍 No Results')
      .setDescription(`No tools matched **"${query}"**.\n\nTry a shorter term like \`role\`, \`ban\`, \`channel\`, \`backup\`.`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(homeBtn(), searchBtn());
    return { content: '', embeds: [embed], components: [row] };
  }

  const shown = tools.slice(0, TOOLS_PER_PAGE);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🔍 "${query}" — ${tools.length} result${tools.length !== 1 ? 's' : ''}`)
    .setDescription(tools.length > TOOLS_PER_PAGE ? `Showing first ${TOOLS_PER_PAGE} of ${tools.length} results.` : '');

  const select = new StringSelectMenuBuilder()
    .setCustomId('cc:ts:utilities:0')
    .setPlaceholder('Select a result to view...')
    .addOptions(
      shown.map(tool => {
        const d = tool.definition;
        return new StringSelectMenuOptionBuilder()
          .setLabel(truncate(`${d.dangerous ? '⚠️ ' : ''}${toolDisplayName(d.name)}`, 100))
          .setDescription(truncate(d.description, 100))
          .setValue(d.name);
      }),
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(homeBtn(), searchBtn());

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      row,
    ],
  };
}

// ── Favorites ──────────────────────────────────────────────────────────────

export function buildFavoritesPanel(tools: ITool[]): CCPayload {
  if (tools.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('⭐ Favorites')
      .setDescription('You have no favorites yet.\nBrowse a tool and click **☆ Favorite** to pin it here.');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(homeBtn(), searchBtn());
    return { content: '', embeds: [embed], components: [row] };
  }

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`⭐ Favorites — ${tools.length} tool${tools.length !== 1 ? 's' : ''}`)
    .setDescription('Your pinned tools for quick access.');

  const select = new StringSelectMenuBuilder()
    .setCustomId('cc:ts:utilities:0')
    .setPlaceholder('Open a favorite tool...')
    .addOptions(
      tools.slice(0, TOOLS_PER_PAGE).map(tool => {
        const d = tool.definition;
        return new StringSelectMenuOptionBuilder()
          .setLabel(truncate(toolDisplayName(d.name), 100))
          .setDescription(truncate(d.description, 100))
          .setValue(d.name);
      }),
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(homeBtn(), searchBtn());

  return {
    content: '',
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      row,
    ],
  };
}

// ── Modals ─────────────────────────────────────────────────────────────────

export function buildToolModal(tool: ITool): ModalBuilder {
  const d = tool.definition;
  const props = d.parameters.properties ?? {};
  const required = d.parameters.required ?? [];

  const sorted = [
    ...Object.entries(props).filter(([k]) => required.includes(k)),
    ...Object.entries(props).filter(([k]) => !required.includes(k)),
  ].slice(0, 5);

  const modal = new ModalBuilder()
    .setCustomId(`cc:modal:${d.name}`)
    .setTitle(truncate(`Execute: ${toolDisplayName(d.name)}`, 45));

  for (const [key, schema] of sorted) {
    const isLong = /content|description|reason|message|topic|text|body|json/.test(key);
    const isRequired = required.includes(key);
    const enumHint = schema.enum ? `Options: ${schema.enum.join(', ')}` : '';
    const placeholder = truncate(enumHint || schema.description, 100);

    const input = new TextInputBuilder()
      .setCustomId(key)
      .setLabel(truncate(toolDisplayName(key), 45))
      .setStyle(isLong ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setPlaceholder(placeholder)
      .setRequired(isRequired);

    if (schema.minimum !== undefined) input.setMinLength(schema.minimum);
    if (schema.maximum !== undefined) input.setMaxLength(schema.maximum);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  return modal;
}

export function buildSearchModal(): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('query')
    .setLabel('Search Query')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. ban, create channel, backup, role...')
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(100);

  return new ModalBuilder()
    .setCustomId('cc:search_submit')
    .setTitle('🔍 Search Tools')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}
