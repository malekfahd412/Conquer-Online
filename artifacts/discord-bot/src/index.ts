import { loadConfig } from './config/config';
import { logger } from './utils/logger';
import { createProvider } from './providers/factory';
import { ServerStatusRepository } from './repositories/server-status.repository';
import { ServerStatusService } from './services/server-status.service';
import { createDiscordClient, loginClient } from './discord/client';
import { MessageManager } from './discord/message-manager';
import { buildStatusEmbed } from './discord/embed-builder';
import { buildSocialButtons } from './discord/button-builder';
import { AIService } from './ai/ai.service';
import { GuildObserver } from './ai/observer/guild-observer';
import { registerSlashCommands } from './discord/slash-command-registrar';
import { welcomeService } from './discord/welcome/welcome.service';
import { serverLogService } from './discord/logging/server-log.service';
import { verificationService } from './discord/verification/verification.service';
import { expiryManager } from './community/moderation';
import { reportScheduler } from './community/staff';

import type { GuildChannel } from 'discord.js';

const RETRY_CONNECT_INTERVAL_MS = 15_000;

async function connectWithRetry(
  provider: ReturnType<typeof createProvider>,
  dataSource: string,
): Promise<void> {
  while (true) {
    try {
      logger.info(`Connecting to data source (${dataSource})...`);
      await provider.connect();
      return;
    } catch (error) {
      logger.error(
        `Data source connection failed. Retrying in ${RETRY_CONNECT_INTERVAL_MS / 1000}s...`,
        error,
      );
      await sleep(RETRY_CONNECT_INTERVAL_MS);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  logger.info('========================================');
  logger.info('  Conquer Online Live Server Status Bot ');
  logger.info('========================================');

  logger.info('Loading configuration...');
  const config = loadConfig();
  logger.success(`Configuration loaded — Server: ${config.server.name}`);
  logger.info(`Data source: ${config.dataSource}`);
  logger.info(`Update interval: ${config.updateIntervalMs}ms`);
  logger.info(`AI provider: ${config.ai.provider}`);

  const provider = createProvider(config);
  const repository = new ServerStatusRepository(provider);
  const service = new ServerStatusService(repository);

  const embedOptions = { serverLogoUrl: config.server.logoUrl };
  const socialButtons = buildSocialButtons(config.social);

  const buttonCount = socialButtons.reduce((n, row) => n + row.components.length, 0);
  if (buttonCount > 0) {
    logger.info(`Social buttons: ${buttonCount} button(s) across ${socialButtons.length} row(s)`);
  } else {
    logger.info('No social URLs configured — buttons row will be empty');
  }

  connectWithRetry(provider, config.dataSource).catch(error => {
    logger.error('Unexpected error in connectWithRetry', error);
  });

  logger.info('Initializing Discord client...');
  const client = createDiscordClient();

  client.on('error', error => {
    logger.error('Discord client error', error);
  });

  // ── Membership ─────────────────────────────────────────────────────────────

  client.on('guildMemberAdd', member => {
    welcomeService.handleJoin(member).catch(err => logger.error('Welcome handler error', err));
    serverLogService.onMemberJoin(member).catch(err => logger.error('Member join log error', err));
  });

  client.on('guildMemberRemove', member => {
    welcomeService.handleLeave(member).catch(err => logger.error('Goodbye handler error', err));
    serverLogService.onMemberLeave(member).catch(err => logger.error('Member leave log error', err));
    verificationService.handleMemberLeave(member).catch(err => logger.error('Verification leave-reset error', err));
  });

  client.on('guildBanAdd', ban => {
    serverLogService.onBanAdd(ban).catch(err => logger.error('Ban log error', err));
  });

  client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (newMember.partial) return;
    serverLogService.onMemberUpdate(oldMember, newMember).catch(err => logger.error('Member update log error', err));
  });

  // ── Messages ───────────────────────────────────────────────────────────────

  client.on('messageDelete', message => {
    serverLogService.onMessageDelete(message).catch(err => logger.error('Message delete log error', err));
  });

  client.on('messageUpdate', (oldMessage, newMessage) => {
    serverLogService.onMessageUpdate(oldMessage, newMessage).catch(err => logger.error('Message update log error', err));
  });

  // ── Voice ──────────────────────────────────────────────────────────────────

  client.on('voiceStateUpdate', (oldState, newState) => {
    serverLogService.onVoiceStateUpdate(oldState, newState).catch(err => logger.error('Voice state log error', err));
  });

  // ── Roles ──────────────────────────────────────────────────────────────────

  client.on('roleCreate', role => {
    serverLogService.onRoleCreate(role).catch(err => logger.error('Role create log error', err));
  });

  client.on('roleDelete', role => {
    serverLogService.onRoleDelete(role).catch(err => logger.error('Role delete log error', err));
  });

  client.on('roleUpdate', (oldRole, newRole) => {
    serverLogService.onRoleUpdate(oldRole, newRole).catch(err => logger.error('Role update log error', err));
  });

  // ── Channels ───────────────────────────────────────────────────────────────

  client.on('channelCreate', channel => {
    if (!channel.isDMBased()) {
      serverLogService.onChannelCreate(channel as GuildChannel).catch(err => logger.error('Channel create log error', err));
    }
  });

  client.on('channelDelete', channel => {
    if (!channel.isDMBased()) {
      serverLogService.onChannelDelete(channel as GuildChannel).catch(err => logger.error('Channel delete log error', err));
    }
  });

  client.on('channelUpdate', (oldChannel, newChannel) => {
    if (!oldChannel.isDMBased() && !newChannel.isDMBased()) {
      serverLogService.onChannelUpdate(oldChannel as GuildChannel, newChannel as GuildChannel)
        .catch(err => logger.error('Channel update log error', err));
    }
  });

  // ── Invites ────────────────────────────────────────────────────────────────

  client.on('inviteCreate', invite => {
    serverLogService.onInviteCreate(invite).catch(err => logger.error('Invite create log error', err));
  });

  client.on('inviteDelete', invite => {
    serverLogService.onInviteDelete(invite).catch(err => logger.error('Invite delete log error', err));
  });

  // ── Server (Guild) ─────────────────────────────────────────────────────────

  client.on('guildUpdate', (oldGuild, newGuild) => {
    serverLogService.onGuildUpdate(oldGuild, newGuild).catch(err => logger.error('Guild update log error', err));
  });

  // ── Emojis & Stickers ──────────────────────────────────────────────────────

  client.on('emojiCreate', emoji => {
    serverLogService.onEmojiCreate(emoji).catch(err => logger.error('Emoji create log error', err));
  });

  client.on('emojiDelete', emoji => {
    serverLogService.onEmojiDelete(emoji).catch(err => logger.error('Emoji delete log error', err));
  });

  client.on('emojiUpdate', (oldEmoji, newEmoji) => {
    serverLogService.onEmojiUpdate(oldEmoji, newEmoji).catch(err => logger.error('Emoji update log error', err));
  });

  client.on('stickerCreate', sticker => {
    serverLogService.onStickerCreate(sticker).catch(err => logger.error('Sticker create log error', err));
  });

  client.on('stickerDelete', sticker => {
    serverLogService.onStickerDelete(sticker).catch(err => logger.error('Sticker delete log error', err));
  });

  client.on('stickerUpdate', (oldSticker, newSticker) => {
    serverLogService.onStickerUpdate(oldSticker, newSticker).catch(err => logger.error('Sticker update log error', err));
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  await loginClient(client, config.discord.token);

  if (client.user) {
    registerSlashCommands(config.discord.token, client.user.id).catch(error => {
      logger.error('Slash command registration failed', error);
    });
  }

  // ── Moderation System Pro ────────────────────────────────────────────────
  expiryManager.setClient(client);
  expiryManager.start().catch(error => {
    logger.error('Moderation expiry manager failed to start', error);
  });

  // ── Staff Management Pro ─────────────────────────────────────────────────
  reportScheduler.setClient(client);
  reportScheduler.start();

  // ── AI Control Center ──────────────────────────────────────────────────────
  logger.info('Initializing AI Control Center...');
  logger.info(`Voice AI: STT=${config.voice.sttProvider}, TTS=${config.voice.ttsProvider}, personality=${config.voice.personality}`);
  const aiService = new AIService({
    serverName: config.server.name,
    adminRole: config.ai.adminRole,
    logChannelId: config.ai.logChannelId,
    chatChannelId: config.ai.chatChannelId,
    enablePlanPreview: config.ai.enablePlanPreview,
    enableReflection: config.ai.enableReflection,
    voice: config.voice,
    supportStaffRoleId: config.ai.supportStaffRoleId,
    supportInboxChannelId: config.ai.supportInboxChannelId,
  });
  await aiService.initialize();
  aiService.start(client);

  // ── Guild Observer ─────────────────────────────────────────────────────────
  if (config.ai.enableObserver) {
    logger.info('Initializing Guild Observer...');
    const observer = new GuildObserver({ logChannelId: config.ai.logChannelId });
    observer.start(client);
  }

  // ── Live Status Loop ───────────────────────────────────────────────────────
  logger.info('Initializing message manager...');
  const messageManager = new MessageManager(client, config.discord.statusChannelId);
  await messageManager.initialize();

  logger.success('Bot is running — starting update loop');

  let updateRunning = false;

  const runUpdate = async (): Promise<void> => {
    if (updateRunning) return;
    updateRunning = true;
    try {
      const status = await service.getServerStatus(config.server.name);
      const embed = buildStatusEmbed(status, embedOptions);
      await messageManager.updateEmbed(embed, socialButtons);
    } catch (error) {
      logger.error('Failed to update status embed', error);
      if (!provider.isConnected()) {
        connectWithRetry(provider, config.dataSource).catch(err => {
          logger.error('Reconnection attempt failed', err);
        });
      }
    } finally {
      updateRunning = false;
      setTimeout(() => {
        runUpdate().catch(err => logger.error('Unhandled error in update loop', err));
      }, config.updateIntervalMs);
    }
  };

  await runUpdate();
}

main().catch(error => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});

// ── Clean shutdown ─────────────────────────────────────────────────────────
const shutdown = (): void => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
