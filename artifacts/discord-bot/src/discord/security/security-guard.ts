// ─────────────────────────────────────────────────────────────────────────────
// Security Guard — Discord event listeners for all 14 Security Center modules.
// Bootstrapped from ai.service.ts start(), same pattern as ticketSystem.init().
// ─────────────────────────────────────────────────────────────────────────────
import {
  AuditLogEvent,
  type Client,
  type Guild,
  type GuildMember,
  type TextChannel,
  type Message,
  type PartialMessage,
  type Channel,
  type Role,
  type GuildEmoji,
  type Sticker,
  type Invite,
} from 'discord.js';
import {
  getGuildConfig,
  handleViolation,
  fetchAuditExecutor,
  restoreChannel,
  restoreRole,
  rateLimiter,
  KNOWN_SCAM_DOMAINS,
} from '../../community/security';
import { logger } from '../../utils/logger';

// ── Helpers ───────────────────────────────────────────────────────────────────

const URL_REGEX    = /https?:\/\/[^\s<>"`]+/gi;
const INVITE_REGEX = /(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[A-Za-z0-9-]+/gi;

function extractUrls(text: string): string[] {
  return text.match(URL_REGEX) ?? [];
}

function extractInvites(text: string): string[] {
  return text.match(INVITE_REGEX) ?? [];
}

function isScamUrl(url: string): boolean {
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase();
    return KNOWN_SCAM_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// ── Ghost-ping cache: remembers messages that had mentions ────────────────────

const mentionCache = new Map<string, { authorId: string; guildId: string; channelId: string; mentions: number; ts: number }>();
const MENTION_CACHE_TTL = 45_000; // 45 seconds

function pruneCache() {
  const cutoff = Date.now() - MENTION_CACHE_TTL;
  for (const [id, v] of mentionCache) {
    if (v.ts < cutoff) mentionCache.delete(id);
  }
}

// ── Security Guard ────────────────────────────────────────────────────────────

export class SecurityGuard {
  start(client: Client): void {
    // ── Anti Raid + Anti Bot Add ─────────────────────────────────────────────
    client.on('guildMemberAdd', (member: GuildMember) => {
      this.onMemberAdd(member).catch(err => logger.error('[Security] guildMemberAdd error', err));
    });

    // ── Anti Channel ─────────────────────────────────────────────────────────
    client.on('channelCreate', (channel: Channel) => {
      if (!('guild' in channel)) return;
      this.onChannelCreate(channel as TextChannel).catch(err => logger.error('[Security] channelCreate error', err));
    });
    client.on('channelDelete', (channel: Channel) => {
      if (!('guild' in channel)) return;
      this.onChannelDelete(channel as TextChannel).catch(err => logger.error('[Security] channelDelete error', err));
    });
    client.on('channelUpdate', (_old: Channel, newChannel: Channel) => {
      if (!('guild' in newChannel)) return;
      this.onChannelUpdate(newChannel as TextChannel).catch(err => logger.error('[Security] channelUpdate error', err));
    });

    // ── Anti Role ─────────────────────────────────────────────────────────────
    client.on('roleCreate', (role: Role) => {
      this.onRoleCreate(role).catch(err => logger.error('[Security] roleCreate error', err));
    });
    client.on('roleDelete', (role: Role) => {
      this.onRoleDelete(role).catch(err => logger.error('[Security] roleDelete error', err));
    });
    client.on('roleUpdate', (_old: Role, newRole: Role) => {
      this.onRoleUpdate(newRole).catch(err => logger.error('[Security] roleUpdate error', err));
    });

    // ── Anti Webhook ──────────────────────────────────────────────────────────
    client.on('webhookUpdate', (channel: TextChannel) => {
      this.onWebhookUpdate(channel).catch(err => logger.error('[Security] webhookUpdate error', err));
    });

    // ── Anti Emoji / Sticker ──────────────────────────────────────────────────
    client.on('emojiCreate', (emoji: GuildEmoji) => {
      this.onEmojiCreate(emoji).catch(err => logger.error('[Security] emojiCreate error', err));
    });
    client.on('emojiDelete', (emoji: GuildEmoji) => {
      this.onEmojiDelete(emoji).catch(err => logger.error('[Security] emojiDelete error', err));
    });
    client.on('stickerCreate', (sticker: Sticker) => {
      if (!sticker.guild) return;
      this.onStickerCreate(sticker).catch(err => logger.error('[Security] stickerCreate error', err));
    });
    client.on('stickerDelete', (sticker: Sticker) => {
      if (!sticker.guild) return;
      this.onStickerDelete(sticker).catch(err => logger.error('[Security] stickerDelete error', err));
    });

    // ── Anti Invite Spam (invite creation) ───────────────────────────────────
    client.on('inviteCreate', (invite: Invite) => {
      if (!invite.guild) return;
      this.onInviteCreate(invite).catch(err => logger.error('[Security] inviteCreate error', err));
    });

    // ── Message-based modules ─────────────────────────────────────────────────
    client.on('messageCreate', (message: Message) => {
      if (!message.guild || message.author.bot) return;
      this.onMessageCreate(message).catch(err => logger.error('[Security] messageCreate error', err));
    });

    // ── Anti Ghost Ping ───────────────────────────────────────────────────────
    client.on('messageDelete', (message: Message | PartialMessage) => {
      if (!message.guild) return;
      this.onMessageDelete(message).catch(err => logger.error('[Security] messageDelete error', err));
    });

    logger.success('[Security] Security Guard activated — 14 modules ready');
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  private async onMemberAdd(member: GuildMember): Promise<void> {
    const cfg = await getGuildConfig(member.guild.id);

    // Anti Raid — track all joins, regardless of who joined
    const raidCfg = cfg.modules.anti_raid;
    if (raidCfg.enabled) {
      const rlKey = `${member.guild.id}:anti_raid:all`;
      const violated = rateLimiter.check(rlKey, raidCfg.actionLimit, raidCfg.timeWindowMs);
      if (violated) {
        rateLimiter.reset(rlKey);
        await handleViolation({
          guild:              member.guild,
          module:             'anti_raid',
          cfg:                raidCfg,
          globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  raidCfg.mentionRoleId,
          executor:           member,
          target:             `<@${member.id}>`,
          action:             'Mass Join Raid Detected',
          detail:             `${raidCfg.actionLimit} joins within ${raidCfg.timeWindowMs / 1000}s`,
        });
      }
    }

    // Anti Bot Add — check if this member is a bot added by a non-trusted user
    const botCfg = cfg.modules.anti_bot_add;
    if (botCfg.enabled && member.user.bot) {
      // Fetch who added the bot via audit log
      const executor = await fetchAuditExecutor(
        member.guild,
        AuditLogEvent.BotAdd,
        member.id,
      );
      if (executor) {
        await handleViolation({
          guild:              member.guild,
          module:             'anti_bot_add',
          cfg:                botCfg,
          globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  botCfg.mentionRoleId,
          executor,
          target:             `${member.user.tag} (\`${member.id}\`)`,
          action:             'Unauthorized Bot Addition',
          detail:             `Bot **${member.user.tag}** was added to the server.`,
        });
      }
    }
  }

  private async onChannelCreate(channel: TextChannel): Promise<void> {
    if (!channel.guild) return;
    const cfg    = await getGuildConfig(channel.guild.id);
    const modCfg = cfg.modules.anti_channel;
    if (!modCfg.enabled) return;
    const executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    await handleViolation({
      guild:              channel.guild,
      module:             'anti_channel',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor,
      target:             `#${channel.name} (\`${channel.id}\`)`,
      action:             'Unauthorized Channel Created',
      rateLimitKey:       executor?.id ?? 'unknown',
    });
  }

  private async onChannelDelete(channel: TextChannel): Promise<void> {
    if (!channel.guild) return;
    const cfg    = await getGuildConfig(channel.guild.id);
    const modCfg = cfg.modules.anti_channel;
    const nukeCfg = cfg.modules.anti_nuke;

    const executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);

    // Anti Channel
    if (modCfg.enabled) {
      await handleViolation({
        guild:              channel.guild,
        module:             'anti_channel',
        cfg:                modCfg,
        globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  modCfg.mentionRoleId,
        executor,
        target:             `#${channel.name}`,
        action:             'Unauthorized Channel Deleted',
        rateLimitKey:       executor?.id ?? 'unknown',
      });
    }

    // Anti Nuke — track deletions separately
    if (nukeCfg.enabled && executor) {
      const nukeKey = `${channel.guild.id}:anti_nuke:${executor.id}`;
      const nukeViolated = rateLimiter.check(nukeKey, nukeCfg.actionLimit, nukeCfg.timeWindowMs);
      if (nukeViolated) {
        rateLimiter.reset(nukeKey);
        await handleViolation({
          guild:              channel.guild,
          module:             'anti_nuke',
          cfg:                nukeCfg,
          globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  nukeCfg.mentionRoleId,
          executor,
          action:             'Server Nuke — Mass Channel Deletion',
          detail:             `${nukeCfg.actionLimit} channels deleted within ${nukeCfg.timeWindowMs / 1000}s`,
          skipRateLimit:      true,
        });
      }
    }

    // Best-effort restore if nuke detected
    if (nukeCfg.enabled && nukeCfg.extra?.restoreOnNuke === true) {
      await restoreChannel(channel.guild, channel);
    }
  }

  private async onChannelUpdate(channel: TextChannel): Promise<void> {
    if (!channel.guild) return;
    const cfg    = await getGuildConfig(channel.guild.id);
    const modCfg = cfg.modules.anti_channel;
    if (!modCfg.enabled) return;
    const executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.ChannelUpdate, channel.id);
    await handleViolation({
      guild:              channel.guild,
      module:             'anti_channel',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor,
      target:             `#${channel.name}`,
      action:             'Unauthorized Channel Updated',
      rateLimitKey:       executor?.id ?? 'unknown',
    });
  }

  private async onRoleCreate(role: Role): Promise<void> {
    const cfg    = await getGuildConfig(role.guild.id);
    const modCfg = cfg.modules.anti_role;
    if (!modCfg.enabled) return;
    const executor = await fetchAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    await handleViolation({
      guild:              role.guild,
      module:             'anti_role',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor,
      target:             `@${role.name}`,
      action:             'Unauthorized Role Created',
      rateLimitKey:       executor?.id ?? 'unknown',
    });
  }

  private async onRoleDelete(role: Role): Promise<void> {
    const cfg     = await getGuildConfig(role.guild.id);
    const modCfg  = cfg.modules.anti_role;
    const nukeCfg = cfg.modules.anti_nuke;
    const executor = await fetchAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);

    if (modCfg.enabled) {
      await handleViolation({
        guild:              role.guild,
        module:             'anti_role',
        cfg:                modCfg,
        globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  modCfg.mentionRoleId,
        executor,
        target:             `@${role.name}`,
        action:             'Unauthorized Role Deleted',
        rateLimitKey:       executor?.id ?? 'unknown',
      });
    }

    if (nukeCfg.enabled && executor) {
      const nukeKey     = `${role.guild.id}:anti_nuke_role:${executor.id}`;
      const nukeViolated = rateLimiter.check(nukeKey, nukeCfg.actionLimit, nukeCfg.timeWindowMs);
      if (nukeViolated) {
        rateLimiter.reset(nukeKey);
        await handleViolation({
          guild:              role.guild,
          module:             'anti_nuke',
          cfg:                nukeCfg,
          globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  nukeCfg.mentionRoleId,
          executor,
          action:             'Server Nuke — Mass Role Deletion',
          detail:             `${nukeCfg.actionLimit} roles deleted within ${nukeCfg.timeWindowMs / 1000}s`,
          skipRateLimit:      true,
        });
      }
    }

    // Best-effort restore
    if (nukeCfg.enabled && nukeCfg.extra?.restoreOnNuke === true) {
      await restoreRole(role.guild, role);
    }
  }

  private async onRoleUpdate(role: Role): Promise<void> {
    const cfg    = await getGuildConfig(role.guild.id);
    const modCfg = cfg.modules.anti_role;
    if (!modCfg.enabled) return;
    const executor = await fetchAuditExecutor(role.guild, AuditLogEvent.RoleUpdate, role.id);
    await handleViolation({
      guild:              role.guild,
      module:             'anti_role',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor,
      target:             `@${role.name}`,
      action:             'Unauthorized Role Updated',
      rateLimitKey:       executor?.id ?? 'unknown',
    });
  }

  private async onWebhookUpdate(channel: TextChannel): Promise<void> {
    if (!channel.guild) return;
    const cfg    = await getGuildConfig(channel.guild.id);
    const modCfg = cfg.modules.anti_webhook;
    if (!modCfg.enabled) return;

    // Try create first, then delete
    let executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.WebhookCreate).catch(() => null);
    let action = 'Unauthorized Webhook Created';
    if (!executor) {
      executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.WebhookDelete).catch(() => null);
      action = 'Unauthorized Webhook Deleted';
    }
    if (!executor) {
      executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.WebhookUpdate).catch(() => null);
      action = 'Unauthorized Webhook Updated';
    }
    if (!executor) return;

    await handleViolation({
      guild:              channel.guild,
      module:             'anti_webhook',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor,
      target:             `#${channel.name}`,
      action,
      rateLimitKey:       executor.id,
    });
  }

  private async onEmojiCreate(emoji: GuildEmoji): Promise<void> {
    const cfg    = await getGuildConfig(emoji.guild.id);
    const modCfg = cfg.modules.anti_emoji_sticker;
    if (!modCfg.enabled) return;
    const executor = await fetchAuditExecutor(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
    await handleViolation({
      guild:              emoji.guild,
      module:             'anti_emoji_sticker',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor,
      target:             `:${emoji.name}: (\`${emoji.id}\`)`,
      action:             'Emoji Created',
      rateLimitKey:       executor?.id ?? 'unknown',
    });
  }

  private async onEmojiDelete(emoji: GuildEmoji): Promise<void> {
    const cfg    = await getGuildConfig(emoji.guild.id);
    const modCfg = cfg.modules.anti_emoji_sticker;
    if (!modCfg.enabled) return;
    const executor = await fetchAuditExecutor(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
    await handleViolation({
      guild:              emoji.guild,
      module:             'anti_emoji_sticker',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor,
      target:             `:${emoji.name}:`,
      action:             'Emoji Deleted',
      rateLimitKey:       executor?.id ?? 'unknown',
    });
  }

  private async onStickerCreate(sticker: Sticker): Promise<void> {
    if (!sticker.guild) return;
    const cfg    = await getGuildConfig(sticker.guild.id);
    const modCfg = cfg.modules.anti_emoji_sticker;
    if (!modCfg.enabled) return;
    const executor = await fetchAuditExecutor(sticker.guild, AuditLogEvent.StickerCreate, sticker.id);
    await handleViolation({
      guild:              sticker.guild,
      module:             'anti_emoji_sticker',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor,
      target:             `${sticker.name} (\`${sticker.id}\`)`,
      action:             'Sticker Created',
      rateLimitKey:       executor?.id ?? 'unknown',
    });
  }

  private async onStickerDelete(sticker: Sticker): Promise<void> {
    if (!sticker.guild) return;
    const cfg    = await getGuildConfig(sticker.guild.id);
    const modCfg = cfg.modules.anti_emoji_sticker;
    if (!modCfg.enabled) return;
    const executor = await fetchAuditExecutor(sticker.guild, AuditLogEvent.StickerDelete, sticker.id);
    await handleViolation({
      guild:              sticker.guild,
      module:             'anti_emoji_sticker',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor,
      target:             sticker.name,
      action:             'Sticker Deleted',
      rateLimitKey:       executor?.id ?? 'unknown',
    });
  }

  private async onInviteCreate(invite: Invite): Promise<void> {
    if (!invite.guild || !invite.inviter) return;
    const cfg    = await getGuildConfig(invite.guild.id);
    const modCfg = cfg.modules.anti_invite_spam;
    if (!modCfg.enabled) return;
    const member = await (invite.guild as Guild).members.fetch(invite.inviter.id).catch(() => null);
    await handleViolation({
      guild:              invite.guild as Guild,
      module:             'anti_invite_spam',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor:           member ?? invite.inviter,
      target:             invite.code,
      action:             'Rapid Invite Creation',
      rateLimitKey:       invite.inviter.id,
    });
  }

  private async onMessageCreate(message: Message): Promise<void> {
    if (!message.guild || !message.member) return;
    const cfg = await getGuildConfig(message.guild.id);
    const content = message.content ?? '';

    // Cache for ghost-ping detection
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount > 0) {
      pruneCache();
      mentionCache.set(message.id, {
        authorId:  message.author.id,
        guildId:   message.guild.id,
        channelId: message.channel.id,
        mentions:  mentionCount,
        ts:        Date.now(),
      });
    }

    // ── Anti Mention Spam ─────────────────────────────────────────────────────
    const mentionCfg = cfg.modules.anti_mention_spam;
    if (mentionCfg.enabled && mentionCount >= mentionCfg.actionLimit) {
      await message.delete().catch(() => {});
      await handleViolation({
        guild:              message.guild,
        module:             'anti_mention_spam',
        cfg:                mentionCfg,
        globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  mentionCfg.mentionRoleId,
        executor:           message.member,
        target:             `#${(message.channel as TextChannel).name}`,
        action:             'Mention Spam',
        detail:             `${mentionCount} mentions in a single message (limit: ${mentionCfg.actionLimit})`,
        rateLimitKey:       message.author.id,
      });
      return;
    }

    // ── Anti Invite Spam (link form) ──────────────────────────────────────────
    const inviteInMsgCfg = cfg.modules.anti_invite_spam;
    const invites = extractInvites(content);
    if (inviteInMsgCfg.enabled && invites.length > 0) {
      await message.delete().catch(() => {});
      await handleViolation({
        guild:              message.guild,
        module:             'anti_invite_spam',
        cfg:                inviteInMsgCfg,
        globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  inviteInMsgCfg.mentionRoleId,
        executor:           message.member,
        target:             `#${(message.channel as TextChannel).name}`,
        action:             'Invite Link Posted',
        detail:             invites.slice(0, 5).join(', '),
        rateLimitKey:       message.author.id,
      });
      return;
    }

    // ── Anti Scam Link ────────────────────────────────────────────────────────
    const scamCfg = cfg.modules.anti_scam_link;
    if (scamCfg.enabled) {
      const urls = extractUrls(content);
      const customDomains = (scamCfg.extra?.customDomains as string[]) ?? [];
      const scamUrls = urls.filter(u => {
        if (isScamUrl(u)) return true;
        try {
          const host = new URL(u).hostname.toLowerCase();
          return customDomains.some(d => host === d || host.endsWith(`.${d}`));
        } catch { return false; }
      });
      if (scamUrls.length > 0) {
        await message.delete().catch(() => {});
        await handleViolation({
          guild:              message.guild,
          module:             'anti_scam_link',
          cfg:                scamCfg,
          globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  scamCfg.mentionRoleId,
          executor:           message.member,
          target:             `#${(message.channel as TextChannel).name}`,
          action:             'Scam/Phishing Link Detected',
          detail:             scamUrls.slice(0, 3).join('\n'),
        });
        return;
      }
    }

    // ── Anti Link Spam ────────────────────────────────────────────────────────
    const linkCfg = cfg.modules.anti_link_spam;
    if (linkCfg.enabled) {
      const urls = extractUrls(content);
      if (urls.length > 0) {
        await handleViolation({
          guild:              message.guild,
          module:             'anti_link_spam',
          cfg:                linkCfg,
          globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  linkCfg.mentionRoleId,
          executor:           message.member,
          target:             `#${(message.channel as TextChannel).name}`,
          action:             'Link Spam',
          detail:             `${urls.length} URL(s) detected`,
          rateLimitKey:       message.author.id,
        });
      }
    }

    // ── Anti Bad Words ────────────────────────────────────────────────────────
    const badWordCfg = cfg.modules.anti_bad_words;
    if (badWordCfg.enabled) {
      const wordList = (badWordCfg.extra?.words as string[]) ?? [];
      if (wordList.length > 0) {
        const lower = content.toLowerCase();
        const hit = wordList.find(w => lower.includes(w.toLowerCase()));
        if (hit) {
          await message.delete().catch(() => {});
          await handleViolation({
            guild:              message.guild,
            module:             'anti_bad_words',
            cfg:                badWordCfg,
            globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  badWordCfg.mentionRoleId,
            executor:           message.member,
            target:             `#${(message.channel as TextChannel).name}`,
            action:             'Bad Word Detected',
            detail:             `Matched word: \`${hit}\``,
            rateLimitKey:       message.author.id,
          });
          return;
        }
      }
    }

    // ── Anti Mass DM (rapid messaging proxy) ──────────────────────────────────
    const massDmCfg = cfg.modules.anti_mass_dm;
    if (massDmCfg.enabled) {
      await handleViolation({
        guild:              message.guild,
        module:             'anti_mass_dm',
        cfg:                massDmCfg,
        globalLogChannelId:   cfg.securityLogChannelId,
        globalMentionRoleId:  cfg.securityMentionRoleId,
        moduleMentionRoleId:  massDmCfg.mentionRoleId,
        executor:           message.member,
        target:             `#${(message.channel as TextChannel).name}`,
        action:             'Rapid Mass Messaging Pattern',
        detail:             `Exceeded ${massDmCfg.actionLimit} messages in ${massDmCfg.timeWindowMs / 1000}s`,
        rateLimitKey:       message.author.id,
      });
    }
  }

  private async onMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (!message.guild) return;
    const cached = mentionCache.get(message.id);
    if (!cached) return;

    // Only flag if the delete happened within 30 seconds of the post
    const age = Date.now() - cached.ts;
    if (age > 30_000) { mentionCache.delete(message.id); return; }
    mentionCache.delete(message.id);

    const cfg    = await getGuildConfig(message.guild.id);
    const modCfg = cfg.modules.anti_ghost_ping;
    if (!modCfg.enabled) return;

    const member = await (message.guild as Guild).members.fetch(cached.authorId).catch(() => null);
    if (!member) return;

    await handleViolation({
      guild:              message.guild as Guild,
      module:             'anti_ghost_ping',
      cfg:                modCfg,
      globalLogChannelId: cfg.securityLogChannelId,
      globalMentionRoleId:  cfg.securityMentionRoleId,
      moduleMentionRoleId:  modCfg.mentionRoleId,
      executor:           member,
      target:             `<#${cached.channelId}>`,
      action:             'Ghost Ping Detected',
      detail:             `Message with ${cached.mentions} mention(s) deleted ${Math.floor(age / 1000)}s after sending`,
      rateLimitKey:       cached.authorId,
    });
  }
}

