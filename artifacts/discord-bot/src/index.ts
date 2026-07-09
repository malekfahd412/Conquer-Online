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

  await loginClient(client, config.discord.token);

  if (client.user) {
    registerSlashCommands(config.discord.token, client.user.id).catch(error => {
      logger.error('Slash command registration failed', error);
    });
  }

  // ── AI Control Center ──────────────────────────────────────────────────
  logger.info('Initializing AI Control Center...');
  const aiService = new AIService({
    serverName: config.server.name,
    adminRole: config.ai.adminRole,
    logChannelId: config.ai.logChannelId,
    chatChannelId: config.ai.chatChannelId,
    enablePlanPreview: config.ai.enablePlanPreview,
    enableReflection: config.ai.enableReflection,
  });
  await aiService.initialize();
  aiService.start(client);

  // ── Guild Observer ─────────────────────────────────────────────────────
  if (config.ai.enableObserver) {
    logger.info('Initializing Guild Observer...');
    const observer = new GuildObserver({ logChannelId: config.ai.logChannelId });
    observer.start(client);
  }

  // ── Live Status Loop ───────────────────────────────────────────────────
  logger.info('Initializing message manager...');
  const messageManager = new MessageManager(client, config.discord.statusChannelId);
  await messageManager.initialize();

  logger.success('Bot is running — starting update loop');

  let updateRunning = false;

  const runUpdate = async (): Promise<void> => {
    if (updateRunning) return; // Prevent overlapping updates
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
      // Schedule next update only after this one completes
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
