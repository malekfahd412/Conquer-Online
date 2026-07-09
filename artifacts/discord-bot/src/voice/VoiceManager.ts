import type { Client, Guild, VoiceChannel, StageChannel, GuildTextBasedChannel, GuildMember } from 'discord.js';
import { ChannelType } from 'discord.js';
import { VoiceSession } from './VoiceSession';
import { VoicePermissions } from './VoicePermissions';
import { createSpeechRecognizer, type STTProviderName } from './SpeechRecognizer';
import { createSpeechSynthesizer, type TTSProviderName } from './SpeechSynthesizer';
import type { VoicePersonality, VoiceAIComponents } from './VoiceConversation';
import { logger } from '../utils/logger';

export interface VoiceManagerOptions {
  ai: VoiceAIComponents;
  sttProvider: STTProviderName;
  ttsProvider: TTSProviderName;
  personality: VoicePersonality;
  adminRoleIdentifier: string;
  confirmChannelId: string | undefined;
  /** Shared button handler map from AIService — for dangerous-action confirmations in voice */
  pendingButtons: Map<string, { userId: string; callback: () => Promise<void>; executing: boolean }>;
}

export class VoiceManager {
  /** Map of guildId → VoiceSession */
  private readonly sessions = new Map<string, VoiceSession>();
  private readonly permissions: VoicePermissions;
  private readonly opts: VoiceManagerOptions;

  constructor(opts: VoiceManagerOptions) {
    this.opts = opts;
    this.permissions = new VoicePermissions(opts.adminRoleIdentifier);
  }

  // ── Session Lifecycle ─────────────────────────────────────────────────────

  async join(
    guild: Guild,
    channel: VoiceChannel | StageChannel,
    requestingMember: GuildMember,
    client: Client,
  ): Promise<{ success: boolean; message: string }> {
    if (!this.permissions.canUseVoiceAI(requestingMember)) {
      return { success: false, message: 'You do not have permission to use Voice AI.' };
    }

    // If already in a session for this guild, destroy it first
    const existing = this.sessions.get(guild.id);
    if (existing) {
      if (existing.channelId === channel.id) {
        return { success: false, message: `I'm already in **#${channel.name}**.` };
      }
      existing.destroy();
      this.sessions.delete(guild.id);
    }

    const confirmChannel = await this.resolveConfirmChannel(guild);
    const recognizer = createSpeechRecognizer(this.opts.sttProvider);
    const synthesizer = createSpeechSynthesizer(this.opts.ttsProvider);

    const session = new VoiceSession({
      guild,
      channel,
      client,
      recognizer,
      synthesizer,
      ai: this.opts.ai,
      personality: this.opts.personality,
      confirmChannel,
      adminRoleIdentifier: this.opts.adminRoleIdentifier,
      pendingButtons: this.opts.pendingButtons,
    });

    this.sessions.set(guild.id, session);

    // Wait for connection to be ready before playing audio
    try {
      await session.waitForReady();
      logger.info('[VoiceManager] Connection is Ready — playing greeting');
    } catch (err) {
      logger.warning(`[VoiceManager] Connection did not reach Ready state in time — skipping greeting: ${String(err)}`);
    }

    // Announce on join
    logger.info('[VoiceManager] Synthesizing greeting...');
    await session.announce(
      `Hello! I'm Mufasa. Say "Hey Mufasa" to start a conversation.`,
    ).catch(err => {
      logger.error('[VoiceManager] Greeting announce failed', err);
    });

    logger.success(`[VoiceManager] Joined #${channel.name} in ${guild.name}`);
    return { success: true, message: `✅ Joined **#${channel.name}**. Say **"Hey Mufasa"** to start a conversation.` };
  }

  leave(guild: Guild): { success: boolean; message: string } {
    const session = this.sessions.get(guild.id);
    if (!session) {
      return { success: false, message: 'I\'m not in any voice channel in this server.' };
    }

    const channelName = session.channelName;
    session.destroy();
    this.sessions.delete(guild.id);

    logger.info(`[VoiceManager] Left #${channelName} in ${guild.name}`);
    return { success: true, message: `✅ Left **#${channelName}**.` };
  }

  getSession(guildId: string): VoiceSession | undefined {
    return this.sessions.get(guildId);
  }

  setPersonality(guild: Guild, personality: VoicePersonality): { success: boolean; message: string } {
    const session = this.sessions.get(guild.id);
    if (!session) {
      return { success: false, message: 'I\'m not in a voice channel. Use `/voice join` first.' };
    }
    session.setPersonality(personality);
    return { success: true, message: `✅ Personality set to **${personality}**.` };
  }

  getStatus(guildId: string): string {
    const session = this.sessions.get(guildId);
    if (!session) return 'Not connected to any voice channel.';

    return [
      `Channel: **#${session.channelName}**`,
      `Status: **${session.status}**`,
      `Active conversations: **${session.activeConversationCount}**`,
      `Uptime: **${Math.round((Date.now() - session.joinedAt) / 60_000)}m**`,
    ].join('\n');
  }

  /** Clean up all sessions (called on bot shutdown). */
  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.destroy();
    }
    this.sessions.clear();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async resolveConfirmChannel(guild: Guild): Promise<GuildTextBasedChannel | null> {
    if (!this.opts.confirmChannelId) return null;
    try {
      const channel = await guild.channels.fetch(this.opts.confirmChannelId);
      if (channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)) {
        return channel as GuildTextBasedChannel;
      }
    } catch { /* not found */ }
    return null;
  }

  /** Resolve a voice channel from a GuildMember's current voice state. */
  static getMemberVoiceChannel(member: GuildMember): VoiceChannel | StageChannel | null {
    const vc = member.voice.channel;
    if (!vc) return null;
    if (vc.type === ChannelType.GuildVoice || vc.type === ChannelType.GuildStageVoice) {
      return vc as VoiceChannel | StageChannel;
    }
    return null;
  }
}
