import type { ITool } from './tool.interface';

// ── Category & Channel ────────────────────────────────────────────────────────
import { CreateCategoryTool } from './create-category.tool';
import { DeleteCategoryTool } from './delete-category.tool';
import { RenameCategoryTool } from './rename-category.tool';
import { CreateChannelTool } from './create-channel.tool';
import { DeleteChannelTool } from './delete-channel.tool';
import { RenameChannelTool } from './rename-channel.tool';
import { MoveChannelTool } from './move-channel.tool';
import { LockChannelTool } from './lock-channel.tool';
import { UnlockChannelTool } from './unlock-channel.tool';
import { SlowmodeChannelTool } from './slowmode-channel.tool';
import { CloneChannelTool } from './clone-channel.tool';
import { CreateForumChannelTool } from './create-forum-channel.tool';

// ── Threads ───────────────────────────────────────────────────────────────────
import { CreateThreadTool } from './create-thread.tool';
import { ArchiveThreadTool } from './archive-thread.tool';

// ── Roles ─────────────────────────────────────────────────────────────────────
import { CreateRoleTool } from './create-role.tool';
import { DeleteRoleTool } from './delete-role.tool';
import { RenameRoleTool } from './rename-role.tool';
import { MoveRoleTool } from './move-role.tool';
import { ChangeRoleColorTool } from './change-role-color.tool';
import { AssignRoleTool } from './assign-role.tool';
import { RemoveRoleTool } from './remove-role.tool';

// ── Members ───────────────────────────────────────────────────────────────────
import { KickMemberTool } from './kick-member.tool';
import { BanMemberTool } from './ban-member.tool';
import { TimeoutMemberTool } from './timeout-member.tool';
import { RemoveTimeoutTool } from './remove-timeout.tool';
import { SetNicknameTool } from './set-nickname.tool';
import { DisconnectVoiceMemberTool } from './disconnect-voice-member.tool';

// ── Messages & Embeds ─────────────────────────────────────────────────────────
import { SendMessageTool } from './send-message.tool';
import { CreateEmbedTool } from './create-embed.tool';
import { DeleteMessageTool } from './delete-message.tool';
import { PinMessageTool } from './pin-message.tool';
import { CreatePollTool } from './create-poll.tool';

// ── Webhooks ──────────────────────────────────────────────────────────────────
import { CreateWebhookTool } from './create-webhook.tool';
import { DeleteWebhookTool } from './delete-webhook.tool';

// ── Events & Invites ──────────────────────────────────────────────────────────
import { CreateScheduledEventTool } from './create-scheduled-event.tool';
import { DeleteScheduledEventTool } from './delete-scheduled-event.tool';
import { CreateInviteTool } from './create-invite.tool';

export type ToolConstructor = new () => ITool;

export const ALL_TOOLS: ToolConstructor[] = [
  // Category & Channel
  CreateCategoryTool,
  DeleteCategoryTool,
  RenameCategoryTool,
  CreateChannelTool,
  DeleteChannelTool,
  RenameChannelTool,
  MoveChannelTool,
  LockChannelTool,
  UnlockChannelTool,
  SlowmodeChannelTool,
  CloneChannelTool,
  CreateForumChannelTool,
  // Threads
  CreateThreadTool,
  ArchiveThreadTool,
  // Roles
  CreateRoleTool,
  DeleteRoleTool,
  RenameRoleTool,
  MoveRoleTool,
  ChangeRoleColorTool,
  AssignRoleTool,
  RemoveRoleTool,
  // Members
  KickMemberTool,
  BanMemberTool,
  TimeoutMemberTool,
  RemoveTimeoutTool,
  SetNicknameTool,
  DisconnectVoiceMemberTool,
  // Messages & Embeds
  SendMessageTool,
  CreateEmbedTool,
  DeleteMessageTool,
  PinMessageTool,
  CreatePollTool,
  // Webhooks
  CreateWebhookTool,
  DeleteWebhookTool,
  // Events & Invites
  CreateScheduledEventTool,
  DeleteScheduledEventTool,
  CreateInviteTool,
];
