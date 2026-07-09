import { ChannelType, type Guild } from 'discord.js';
import type { ToolResult, ToolCall } from './types';
import { logger } from '../utils/logger';

export interface VerificationResult {
  toolCallId: string;
  toolName: string;
  verified: boolean;
  message: string;
}

/**
 * Verifier checks that AI tool actions actually took effect in the guild.
 * Runs lightweight cache checks after execution — does not re-execute.
 */
export class Verifier {
  async verify(toolCalls: ToolCall[], results: ToolResult[], guild: Guild): Promise<VerificationResult[]> {
    const verifications: VerificationResult[] = [];

    for (const result of results) {
      if (!result.success) {
        verifications.push({
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          verified: false,
          message: `Skipped — tool reported failure: ${result.message}`,
        });
        continue;
      }

      const toolCall = toolCalls.find(tc => tc.id === result.toolCallId);
      if (!toolCall) continue;

      let params: Record<string, unknown> = {};
      try { params = JSON.parse(toolCall.function.arguments) as Record<string, unknown>; } catch { /* skip */ }

      const verification = await this.verifyTool(result.toolName, params, guild);
      verifications.push({ toolCallId: result.toolCallId, toolName: result.toolName, ...verification });

      if (!verification.verified) {
        logger.warning(`[Verifier] ${result.toolName} — UNVERIFIED: ${verification.message}`);
      } else {
        logger.info(`[Verifier] ${result.toolName} — verified ✓`);
      }
    }

    return verifications;
  }

  private async verifyTool(
    toolName: string,
    params: Record<string, unknown>,
    guild: Guild,
  ): Promise<{ verified: boolean; message: string }> {
    const name = typeof params['name'] === 'string' ? params['name'].toLowerCase() : null;

    try {
      switch (toolName) {
        case 'create_channel': {
          if (!name) return { verified: true, message: 'No name to verify' };
          await guild.channels.fetch();
          const exists = guild.channels.cache.some(
            c => c.name.toLowerCase() === name && c.type !== ChannelType.GuildCategory,
          );
          return exists
            ? { verified: true, message: `Channel #${name} confirmed in guild` }
            : { verified: false, message: `Channel #${name} not found after creation` };
        }

        case 'delete_channel': {
          if (!name) return { verified: true, message: 'No name to verify' };
          const gone = !guild.channels.cache.some(
            c => c.name.toLowerCase() === name && c.type !== ChannelType.GuildCategory,
          );
          return gone
            ? { verified: true, message: `Channel #${name} is gone` }
            : { verified: false, message: `Channel #${name} still exists after deletion` };
        }

        case 'create_role': {
          if (!name) return { verified: true, message: 'No name to verify' };
          await guild.roles.fetch();
          const exists = guild.roles.cache.some(r => r.name.toLowerCase() === name);
          return exists
            ? { verified: true, message: `Role @${name} confirmed` }
            : { verified: false, message: `Role @${name} not found after creation` };
        }

        case 'delete_role': {
          if (!name) return { verified: true, message: 'No name to verify' };
          const gone = !guild.roles.cache.some(r => r.name.toLowerCase() === name);
          return gone
            ? { verified: true, message: `Role @${name} is gone` }
            : { verified: false, message: `Role @${name} still exists after deletion` };
        }

        case 'create_category': {
          if (!name) return { verified: true, message: 'No name to verify' };
          const exists = guild.channels.cache.some(
            c => c.name.toLowerCase() === name && c.type === ChannelType.GuildCategory,
          );
          return exists
            ? { verified: true, message: `Category ${name} confirmed` }
            : { verified: false, message: `Category ${name} not found after creation` };
        }

        case 'ban_member':
        case 'kick_member':
        case 'timeout_member':
        case 'remove_timeout':
        case 'send_message':
        case 'create_embed':
        case 'create_webhook':
        case 'create_invite':
        case 'create_scheduled_event':
          // These are verified by the Discord API response — trust it
          return { verified: true, message: 'Verified by Discord API response' };

        default:
          return { verified: true, message: 'No specific verification available — trusting API response' };
      }
    } catch (error) {
      return {
        verified: false,
        message: `Verification error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }
  }
}
