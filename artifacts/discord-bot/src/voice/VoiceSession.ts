import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  type VoiceConnection,
} from '@discordjs/voice';
import type {
  Guild,
  VoiceChannel,
  StageChannel,
  GuildTextBasedChannel,
  Client,
} from 'discord.js';
import { VoicePlayer } from './VoicePlayer';
import { VoiceReceiver } from './VoiceReceiver';
import { VoiceConversation, type VoicePersonality, type VoiceAIComponents } from './VoiceConversation';
import { VoicePermissions } from './VoicePermissions';
import type { ISpeechRecognizer } from './SpeechRecognizer';
import type { ISpeechSynthesizer } from './SpeechSynthesizer';
import { logger } from '../utils/logger';

export interface VoiceSessionOptions {
  guild: Guild;
  channel: VoiceChannel | StageChannel;
  client: Client;
  recognizer: ISpeechRecognizer;
  synthesizer: ISpeechSynthesizer;
  ai: VoiceAIComponents;
  personality: VoicePersonality;
  confirmChannel: GuildTextBasedChannel | null;
  adminRoleIdentifier: string;
  /** Shared button handler map from AIService */
  pendingButtons: Map<string, { userId: string; callback: () => Promise<void>; executing: boolean }>;
}

const RECONNECT_TIMEOUT_MS = 20_000;

export class VoiceSession {
  private connection: VoiceConnection;
  private readonly receiver: VoiceReceiver;
  private readonly player: VoicePlayer;
  private readonly permissions: VoicePermissions;
  /** Map of userId → VoiceConversation */
  private readonly conversations = new Map<string, VoiceConversation>();
  /** Caches of authorization results to avoid per-utterance member fetches */
  private readonly authorizedUsers = new Set<string>();
  private readonly deniedUsers = new Set<string>();
  private readonly opts: VoiceSessionOptions;
  private isDestroyed = false;
  readonly guildId: string;
  readonly channelId: string;
  readonly channelName: string;
  readonly joinedAt: number;

  constructor(opts: VoiceSessionOptions) {
    this.opts = opts;
    this.permissions = new VoicePermissions(opts.adminRoleIdentifier);
    this.guildId = opts.guild.id;
    this.channelId = opts.channel.id;
    this.channelName = opts.channel.name;
    this.joinedAt = Date.now();

    this.connection = joinVoiceChannel({
      channelId: opts.channel.id,
      guildId: opts.guild.id,
      adapterCreator: opts.guild.voiceAdapterCreator,
      selfDeaf: false, // must be false to receive audio
    });

    this.player = new VoicePlayer(this.connection);
    this.receiver = new VoiceReceiver(this.connection);

    this.setupConnectionHandlers();
    this.setupReceiver();

    logger.success(`[VoiceSession] Joined #${opts.channel.name} in ${opts.guild.name}`);
  }

  private setupConnectionHandlers(): void {
    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      if (this.isDestroyed) return;
      logger.warning(`[VoiceSession] Disconnected from #${this.channelName} — attempting reconnect...`);
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, RECONNECT_TIMEOUT_MS),
          entersState(this.connection, VoiceConnectionStatus.Connecting, RECONNECT_TIMEOUT_MS),
        ]);
        logger.info('[VoiceSession] Reconnecting...');
      } catch {
        logger.error('[VoiceSession] Reconnect failed — destroying session');
        this.destroy();
      }
    });

    this.connection.on(VoiceConnectionStatus.Ready, () => {
      logger.info(`[VoiceSession] Connection ready in #${this.channelName}`);
    });

    this.connection.on('error', error => {
      logger.error('[VoiceSession] Connection error', error);
    });
  }

  private setupReceiver(): void {
    this.receiver.on('utterance', async evt => {
      if (this.isDestroyed) return;

      // ── Authorization gate ──────────────────────────────────────────────
      // Only admins (per VoicePermissions/PermissionManager rules) may interact
      // with the voice AI. Results are cached per-session to avoid repeated
      // guild member fetches on every utterance.
      if (this.deniedUsers.has(evt.userId)) return;
      if (!this.authorizedUsers.has(evt.userId)) {
        try {
          const member = await this.opts.guild.members.fetch(evt.userId);
          if (this.permissions.canUseVoiceAI(member)) {
            this.authorizedUsers.add(evt.userId);
          } else {
            this.deniedUsers.add(evt.userId);
            logger.info(`[VoiceSession] Unauthorized speaker ${evt.userId} — ignoring`);
            return;
          }
        } catch {
          // Can't fetch member — deny by default
          return;
        }
      }
      // ───────────────────────────────────────────────────────────────────

      const conversation = this.getOrCreateConversation(evt.userId);
      if (!conversation) return;

      await conversation.processUtterance(evt).catch(err => {
        logger.error(`[VoiceSession] Error processing utterance for ${evt.userId}`, err);
      });
    });
  }

  private getOrCreateConversation(userId: string): VoiceConversation | null {
    let conv = this.conversations.get(userId);
    if (!conv) {
      conv = new VoiceConversation(
        userId,
        this.guildId,
        this.opts.guild,
        this.opts.client,
        this.player,
        this.opts.recognizer,
        this.opts.synthesizer,
        this.opts.ai,
        this.opts.personality,
        this.opts.confirmChannel,
        this.opts.pendingButtons,
      );
      this.conversations.set(userId, conv);
    }
    return conv;
  }

  /** Speak a message to the voice channel (e.g. on join/leave). */
  async announce(text: string): Promise<void> {
    const fakeConv = new VoiceConversation(
      'system',
      this.guildId,
      this.opts.guild,
      this.opts.client,
      this.player,
      this.opts.recognizer,
      this.opts.synthesizer,
      this.opts.ai,
      this.opts.personality,
      this.opts.confirmChannel,
      this.opts.pendingButtons,
    );
    // Access the say method indirectly via synthesize + play
    try {
      const audioBuffer = await this.opts.synthesizer.synthesize(text);
      if (audioBuffer.length > 0) {
        await this.player.play(audioBuffer);
      }
    } catch (err) {
      logger.error('[VoiceSession] Announce failed', err);
    }
    void fakeConv; // suppress unused warning
  }

  setPersonality(personality: VoicePersonality): void {
    // Recreate all conversations with new personality
    for (const [userId, old] of this.conversations) {
      old.destroy();
      this.conversations.set(
        userId,
        new VoiceConversation(
          userId,
          this.guildId,
          this.opts.guild,
          this.opts.client,
          this.player,
          this.opts.recognizer,
          this.opts.synthesizer,
          this.opts.ai,
          personality,
          this.opts.confirmChannel,
          this.opts.pendingButtons,
        ),
      );
    }
    logger.info(`[VoiceSession] Personality set to: ${personality}`);
  }

  get status(): 'connected' | 'connecting' | 'disconnected' | 'destroyed' {
    if (this.isDestroyed) return 'destroyed';
    const state = this.connection.state.status;
    if (state === VoiceConnectionStatus.Ready) return 'connected';
    if (state === VoiceConnectionStatus.Destroyed) return 'destroyed';
    return 'connecting';
  }

  get activeConversationCount(): number {
    let active = 0;
    for (const conv of this.conversations.values()) {
      if (conv.active) active++;
    }
    return active;
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    for (const conv of this.conversations.values()) conv.destroy();
    this.conversations.clear();
    this.receiver.destroy();
    this.player.destroy();

    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }

    logger.info(`[VoiceSession] Session destroyed for #${this.channelName}`);
  }
}
