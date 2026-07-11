// ─────────────────────────────────────────────────────────────────────────────
// PanelManager — CRUD + lifecycle operations for ticket panel configuration.
// Owns data/tickets/panels.json exclusively.
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type Guild,
  type TextChannel,
  type MessageCreateOptions,
} from 'discord.js';
import { JsonStore, genId } from './store';
import type { TicketPanel } from './types';

interface PanelData {
  panels: TicketPanel[];
}

const store = new JsonStore<PanelData>('panels.json', () => ({ panels: [] }));

const STYLE_MAP: Record<string, ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

export type PanelCreateInput = Omit<TicketPanel, 'id' | 'guildId' | 'channelId' | 'messageId' | 'createdAt' | 'updatedAt'> & {
  channelId: string;
};

export class PanelManager {
  async ensureFile(): Promise<void> {
    await store.ensureFile();
  }

  buildPayload(panel: TicketPanel): MessageCreateOptions {
    const embed = new EmbedBuilder().setColor(panel.embed.color).setTitle(panel.embed.title).setDescription(panel.embed.description);
    if (panel.embed.footer) embed.setFooter({ text: panel.embed.footer });
    if (panel.embed.thumbnail) embed.setThumbnail(panel.embed.thumbnail);
    if (panel.embed.banner) embed.setImage(panel.embed.banner);

    const rows: (ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>)[] = [];

    const allButtons = [panel.button, ...panel.additionalButtons];
    if (allButtons.length > 0) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const b of allButtons.slice(0, 5)) {
        const btn = new ButtonBuilder()
          .setCustomId(`tk:open:${panel.id}:${b.ticketType}`)
          .setLabel(b.label)
          .setStyle(STYLE_MAP[b.style] ?? ButtonStyle.Primary);
        if (b.emoji) btn.setEmoji(b.emoji);
        row.addComponents(btn);
      }
      rows.push(row);
    }

    if (panel.selectMenu && panel.selectMenu.options.length > 0) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`tk:select:${panel.id}`)
        .setPlaceholder(panel.selectMenu.placeholder ?? 'Select a ticket type…')
        .addOptions(
          panel.selectMenu.options.slice(0, 25).map(o => ({
            label: o.label,
            value: o.ticketType,
            description: o.description,
            emoji: o.emoji,
          })),
        );
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
    }

    return { embeds: [embed], components: rows as MessageCreateOptions['components'] };
  }

  async publish(guild: Guild, panel: TicketPanel): Promise<TicketPanel> {
    const channel = await guild.channels.fetch(panel.channelId);
    if (!channel?.isTextBased()) throw new Error('Ticket panel channel is not text-based');
    const message = await (channel as TextChannel).send(this.buildPayload(panel));
    return (await this.update(panel.id, { messageId: message.id })) ?? panel;
  }

  preview(panel: TicketPanel): MessageCreateOptions {
    return this.buildPayload(panel);
  }

  async create(guildId: string, input: PanelCreateInput): Promise<TicketPanel> {
    return store.mutate(data => {
      const now = Date.now();
      const panel: TicketPanel = { ...input, id: genId('panel'), guildId, createdAt: now, updatedAt: now };
      data.panels.push(panel);
      return panel;
    });
  }

  async duplicate(panelId: string, newChannelId: string): Promise<TicketPanel | undefined> {
    return store.mutate(data => {
      const source = data.panels.find(p => p.id === panelId);
      if (!source) return undefined;
      const now = Date.now();
      const copy: TicketPanel = {
        ...JSON.parse(JSON.stringify(source)),
        id: genId('panel'),
        channelId: newChannelId,
        messageId: undefined,
        name: `${source.name} (copy)`,
        createdAt: now,
        updatedAt: now,
      };
      data.panels.push(copy);
      return copy;
    });
  }

  async update(panelId: string, patch: Partial<TicketPanel>): Promise<TicketPanel | undefined> {
    return store.mutate(data => {
      const panel = data.panels.find(p => p.id === panelId);
      if (!panel) return undefined;
      Object.assign(panel, patch, { updatedAt: Date.now() });
      return panel;
    });
  }

  async setEnabled(panelId: string, enabled: boolean): Promise<TicketPanel | undefined> {
    return this.update(panelId, { enabled });
  }

  async archive(panelId: string): Promise<TicketPanel | undefined> {
    return this.update(panelId, { enabled: false, archivedAt: Date.now() });
  }

  async delete(panelId: string): Promise<boolean> {
    return store.mutate(data => {
      const before = data.panels.length;
      data.panels = data.panels.filter(p => p.id !== panelId);
      return data.panels.length < before;
    });
  }

  async get(panelId: string): Promise<TicketPanel | undefined> {
    const data = await store.read();
    return data.panels.find(p => p.id === panelId);
  }

  async list(guildId: string, opts: { includeArchived?: boolean } = {}): Promise<TicketPanel[]> {
    const data = await store.read();
    return data.panels.filter(p => p.guildId === guildId && (opts.includeArchived || !p.archivedAt));
  }

  /** Direct access for the migration runner only — bypasses id generation to preserve legacy IDs. */
  async importRaw(panels: TicketPanel[]): Promise<void> {
    await store.mutate(data => {
      for (const panel of panels) {
        if (!data.panels.some(p => p.id === panel.id)) data.panels.push(panel);
      }
    });
  }
}

export const panelManager = new PanelManager();
