// ─────────────────────────────────────────────────────────────────────────────
// CategoryEngine — routes ticket channels between open / closed / archive
// categories. Owns no storage of its own; it only reads category IDs off the
// panel it is given and talks to the Discord API.
// ─────────────────────────────────────────────────────────────────────────────
import { ChannelType, type Guild, type TextChannel } from 'discord.js';
import type { TicketPanel } from './types';
import { logger } from '../../utils/logger';

export class CategoryEngine {
  async resolveCategoryId(guild: Guild, query: string): Promise<string | undefined> {
    const q = query.toLowerCase().trim();
    const channels = await guild.channels.fetch();
    const cat = channels.find(c => c && c.type === ChannelType.GuildCategory && (c.id === q || c.name.toLowerCase() === q));
    return cat?.id;
  }

  async moveToCategory(channel: TextChannel, categoryId: string | undefined, reason: string): Promise<void> {
    if (!categoryId) return;
    try {
      await channel.setParent(categoryId, { lockPermissions: false });
    } catch (err) {
      logger.warning(`[TICKETS] CategoryEngine failed to move channel ${channel.id} (${reason})`, err);
    }
  }

  async moveToOpen(channel: TextChannel, panel: TicketPanel): Promise<void> {
    await this.moveToCategory(channel, panel.openCategory, 'move-to-open');
  }

  async moveToClosed(channel: TextChannel, panel: TicketPanel): Promise<void> {
    await this.moveToCategory(channel, panel.closedCategory, 'move-to-closed');
  }

  async moveToArchive(channel: TextChannel, panel: TicketPanel): Promise<void> {
    await this.moveToCategory(channel, panel.archiveCategory, 'move-to-archive');
  }
}

export const categoryEngine = new CategoryEngine();
