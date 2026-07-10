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

// ═══════════════════════════════════════════════════════════════════════════════
// NEW TOOLS — Task 3 expansion
// ═══════════════════════════════════════════════════════════════════════════════

// ── MODULE 1: Guild Management ────────────────────────────────────────────────
import { EditGuildTool } from './edit-guild.tool';
import { ConfigureWelcomeScreenTool } from './configure-welcome-screen.tool';
import { ConfigureWidgetTool } from './configure-widget.tool';
import { ViewGuildInfoTool } from './view-guild-info.tool';
import { GuildHealthCheckTool } from './guild-health-check.tool';

// ── MODULE 2: Category Management ────────────────────────────────────────────
import { MoveCategoryTool } from './move-category.tool';
import { CloneCategoryTool } from './clone-category.tool';
import { HideCategoryTool } from './hide-category.tool';
import { RevealCategoryTool } from './reveal-category.tool';
import { LockCategoryTool } from './lock-category.tool';
import { UnlockCategoryTool } from './unlock-category.tool';
import { SyncCategoryPermissionsTool } from './sync-category-permissions.tool';

// ── MODULE 3: Channel Management ─────────────────────────────────────────────
import { HideChannelTool } from './hide-channel.tool';
import { RevealChannelTool } from './reveal-channel.tool';
import { SetChannelTopicTool } from './set-channel-topic.tool';
import { SetChannelNsfwTool } from './set-channel-nsfw.tool';
import { BulkDeleteMessagesTool } from './bulk-delete-messages.tool';
import { ChannelInfoTool } from './channel-info.tool';
import { ListChannelsTool } from './list-channels.tool';

// ── MODULE 4: Voice Channel Management ───────────────────────────────────────
import { SetVoiceBitrateTool } from './set-voice-bitrate.tool';
import { SetVoiceUserLimitTool } from './set-voice-user-limit.tool';
import { SetVoiceRegionTool } from './set-voice-region.tool';
import { MoveVoiceMemberTool } from './move-voice-member.tool';
import { MuteVoiceMemberTool } from './mute-voice-member.tool';
import { UnmuteVoiceMemberTool } from './unmute-voice-member.tool';
import { DeafenVoiceMemberTool } from './deafen-voice-member.tool';
import { UndeafenVoiceMemberTool } from './undeafen-voice-member.tool';
import { DisconnectAllVoiceTool } from './disconnect-all-voice.tool';

// ── MODULE 5: Thread Management ───────────────────────────────────────────────
import { UnarchiveThreadTool } from './unarchive-thread.tool';
import { LockThreadTool } from './lock-thread.tool';
import { UnlockThreadTool } from './unlock-thread.tool';
import { DeleteThreadTool } from './delete-thread.tool';
import { RenameThreadTool } from './rename-thread.tool';
import { ListThreadsTool } from './list-threads.tool';

// ── MODULE 6: Forum Management ────────────────────────────────────────────────
import { AddForumTagTool } from './add-forum-tag.tool';
import { SetForumGuidelinesTool } from './set-forum-guidelines.tool';

// ── MODULE 7: Role & Member Management ───────────────────────────────────────
import { CloneRoleTool } from './clone-role.tool';
import { SetRolePermissionsTool } from './set-role-permissions.tool';
import { SetRoleHoistTool } from './set-role-hoist.tool';
import { SetRoleMentionableTool } from './set-role-mentionable.tool';
import { BulkAssignRoleTool } from './bulk-assign-role.tool';
import { BulkRemoveRoleTool } from './bulk-remove-role.tool';
import { ListRolesTool } from './list-roles.tool';
import { RoleInfoTool } from './role-info.tool';
import { UnbanMemberTool } from './unban-member.tool';
import { ListMembersTool } from './list-members.tool';
import { MemberInfoTool } from './member-info.tool';

export type ToolConstructor = new () => ITool;

export const ALL_TOOLS: ToolConstructor[] = [
  // ── Original 37 tools ──────────────────────────────────────────────────────
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

  // ── MODULE 1: Guild Management (5) ─────────────────────────────────────────
  EditGuildTool,
  ConfigureWelcomeScreenTool,
  ConfigureWidgetTool,
  ViewGuildInfoTool,
  GuildHealthCheckTool,

  // ── MODULE 2: Category Management (7) ──────────────────────────────────────
  MoveCategoryTool,
  CloneCategoryTool,
  HideCategoryTool,
  RevealCategoryTool,
  LockCategoryTool,
  UnlockCategoryTool,
  SyncCategoryPermissionsTool,

  // ── MODULE 3: Channel Management (7) ───────────────────────────────────────
  HideChannelTool,
  RevealChannelTool,
  SetChannelTopicTool,
  SetChannelNsfwTool,
  BulkDeleteMessagesTool,
  ChannelInfoTool,
  ListChannelsTool,

  // ── MODULE 4: Voice Channel Management (9) ─────────────────────────────────
  SetVoiceBitrateTool,
  SetVoiceUserLimitTool,
  SetVoiceRegionTool,
  MoveVoiceMemberTool,
  MuteVoiceMemberTool,
  UnmuteVoiceMemberTool,
  DeafenVoiceMemberTool,
  UndeafenVoiceMemberTool,
  DisconnectAllVoiceTool,

  // ── MODULE 5: Thread Management (6) ────────────────────────────────────────
  UnarchiveThreadTool,
  LockThreadTool,
  UnlockThreadTool,
  DeleteThreadTool,
  RenameThreadTool,
  ListThreadsTool,

  // ── MODULE 6: Forum Management (2) ─────────────────────────────────────────
  AddForumTagTool,
  SetForumGuidelinesTool,

  // ── MODULE 7: Role & Member Management (11) ────────────────────────────────
  CloneRoleTool,
  SetRolePermissionsTool,
  SetRoleHoistTool,
  SetRoleMentionableTool,
  BulkAssignRoleTool,
  BulkRemoveRoleTool,
  ListRolesTool,
  RoleInfoTool,
  UnbanMemberTool,
  ListMembersTool,
  MemberInfoTool,
];
