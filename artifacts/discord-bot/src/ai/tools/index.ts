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
// MODULE 1: Guild Management
// ═══════════════════════════════════════════════════════════════════════════════
import { EditGuildTool } from './edit-guild.tool';
import { ConfigureWelcomeScreenTool } from './configure-welcome-screen.tool';
import { ConfigureWidgetTool } from './configure-widget.tool';
import { ViewGuildInfoTool } from './view-guild-info.tool';
import { GuildHealthCheckTool } from './guild-health-check.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 2: Category Management
// ═══════════════════════════════════════════════════════════════════════════════
import { MoveCategoryTool } from './move-category.tool';
import { CloneCategoryTool } from './clone-category.tool';
import { HideCategoryTool } from './hide-category.tool';
import { RevealCategoryTool } from './reveal-category.tool';
import { LockCategoryTool } from './lock-category.tool';
import { UnlockCategoryTool } from './unlock-category.tool';
import { SyncCategoryPermissionsTool } from './sync-category-permissions.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 3: Channel Management
// ═══════════════════════════════════════════════════════════════════════════════
import { HideChannelTool } from './hide-channel.tool';
import { RevealChannelTool } from './reveal-channel.tool';
import { SetChannelTopicTool } from './set-channel-topic.tool';
import { SetChannelNsfwTool } from './set-channel-nsfw.tool';
import { BulkDeleteMessagesTool } from './bulk-delete-messages.tool';
import { ChannelInfoTool } from './channel-info.tool';
import { ListChannelsTool } from './list-channels.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 4: Voice Channel Management
// ═══════════════════════════════════════════════════════════════════════════════
import { SetVoiceBitrateTool } from './set-voice-bitrate.tool';
import { SetVoiceUserLimitTool } from './set-voice-user-limit.tool';
import { SetVoiceRegionTool } from './set-voice-region.tool';
import { MoveVoiceMemberTool } from './move-voice-member.tool';
import { MuteVoiceMemberTool } from './mute-voice-member.tool';
import { UnmuteVoiceMemberTool } from './unmute-voice-member.tool';
import { DeafenVoiceMemberTool } from './deafen-voice-member.tool';
import { UndeafenVoiceMemberTool } from './undeafen-voice-member.tool';
import { DisconnectAllVoiceTool } from './disconnect-all-voice.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 5: Thread Management
// ═══════════════════════════════════════════════════════════════════════════════
import { UnarchiveThreadTool } from './unarchive-thread.tool';
import { LockThreadTool } from './lock-thread.tool';
import { UnlockThreadTool } from './unlock-thread.tool';
import { DeleteThreadTool } from './delete-thread.tool';
import { RenameThreadTool } from './rename-thread.tool';
import { ListThreadsTool } from './list-threads.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 6: Forum Management
// ═══════════════════════════════════════════════════════════════════════════════
import { AddForumTagTool } from './add-forum-tag.tool';
import { SetForumGuidelinesTool } from './set-forum-guidelines.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 7: Role & Member Management
// ═══════════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 8: Member Management (Complete)
// ═══════════════════════════════════════════════════════════════════════════════
import { SearchMembersTool } from './search-members.tool';
import { FilterMembersTool } from './filter-members.tool';
import { BulkNicknameTool } from './bulk-nickname.tool';
import { RemoveNicknameTool } from './remove-nickname.tool';
import { BulkTimeoutTool } from './bulk-timeout.tool';
import { BulkRemoveTimeoutTool } from './bulk-remove-timeout.tool';
import { BulkKickTool } from './bulk-kick.tool';
import { BulkBanTool } from './bulk-ban.tool';
import { BulkUnbanTool } from './bulk-unban.tool';
import { SoftBanTool } from './soft-ban.tool';
import { MassMoveVoiceTool } from './mass-move-voice.tool';
import { MassServerMuteTool } from './mass-server-mute.tool';
import { MassServerUnmuteTool } from './mass-server-unmute.tool';
import { MassServerDeafenTool } from './mass-server-deafen.tool';
import { MassServerUndeafenTool } from './mass-server-undeafen.tool';
import { AddWarningTool } from './add-warning.tool';
import { RemoveWarningTool } from './remove-warning.tool';
import { WarningsHistoryTool } from './warnings-history.tool';
import { ModeratorNotesTool } from './moderator-notes.tool';
import { RemoveNotesTool } from './remove-notes.tool';
import { MemberHistoryTool } from './member-history.tool';
import { MemberStatisticsTool } from './member-statistics.tool';
import { MemberJoinPositionTool } from './member-join-position.tool';
import { ExportMemberDataTool } from './export-member-data.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 9: Message Management (Complete)
// ═══════════════════════════════════════════════════════════════════════════════
import { EditMessageTool } from './edit-message.tool';
import { UnpinMessageTool } from './unpin-message.tool';
import { BulkPinTool } from './bulk-pin.tool';
import { BulkUnpinTool } from './bulk-unpin.tool';
import { CloneMessageTool } from './clone-message.tool';
import { CloneEmbedTool } from './clone-embed.tool';
import { CrosspostMessageTool } from './crosspost-message.tool';
import { ScheduleMessageTool } from './schedule-message.tool';
import { CancelScheduledMessageTool } from './cancel-scheduled-message.tool';
import { QuoteMessageTool } from './quote-message.tool';
import { ForwardMessageTool } from './forward-message.tool';
import { CopyMessageLinkTool } from './copy-message-link.tool';
import { SearchMessagesTool } from './search-messages.tool';
import { ExportMessagesTool } from './export-messages.tool';
import { MessageAnalyticsTool } from './message-analytics.tool';
import { TranslateMessageTool } from './translate-message.tool';
import { RewriteMessageTool } from './rewrite-message.tool';
import { FixGrammarTool } from './fix-grammar.tool';
import { SummarizeMessageTool } from './summarize-message.tool';
import { ConvertToEmbedTool } from './convert-to-embed.tool';
import { ConvertEmbedToJsonTool } from './convert-embed-to-json.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 11: Audit Log
// ═══════════════════════════════════════════════════════════════════════════════
import { ViewAuditLogTool } from './view-audit-log.tool';
import { AuditLogByModeratorTool } from './audit-log-by-moderator.tool';
import { AuditLogByTargetTool } from './audit-log-by-target.tool';
import { AuditLogSummaryTool } from './audit-log-summary.tool';
import { AuditLogSearchTool } from './audit-log-search.tool';
import { ExportAuditLogTool } from './export-audit-log.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 10: Permission Management (Complete)
// ═══════════════════════════════════════════════════════════════════════════════
import { PermissionCalculatorTool } from './permission-calculator.tool';
import { PermissionSimulatorTool } from './permission-simulator.tool';
import { PermissionBackupTool } from './permission-backup.tool';
import { PermissionRestoreTool } from './permission-restore.tool';
import { PermissionCompareTool } from './permission-compare.tool';
import { PermissionDiffTool } from './permission-diff.tool';
import { PermissionAuditTool } from './permission-audit.tool';
import { PermissionExplanationTool } from './permission-explanation.tool';
import { PermissionRepairTool } from './permission-repair.tool';
import { PermissionResetTool } from './permission-reset.tool';
import { PermissionExportTool } from './permission-export.tool';
import { PermissionImportTool } from './permission-import.tool';

export type ToolConstructor = new () => ITool;

export const ALL_TOOLS: ToolConstructor[] = [
  // ── Original 37 ────────────────────────────────────────────────────────────
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
  CreateThreadTool,
  ArchiveThreadTool,
  CreateRoleTool,
  DeleteRoleTool,
  RenameRoleTool,
  MoveRoleTool,
  ChangeRoleColorTool,
  AssignRoleTool,
  RemoveRoleTool,
  KickMemberTool,
  BanMemberTool,
  TimeoutMemberTool,
  RemoveTimeoutTool,
  SetNicknameTool,
  DisconnectVoiceMemberTool,
  SendMessageTool,
  CreateEmbedTool,
  DeleteMessageTool,
  PinMessageTool,
  CreatePollTool,
  CreateWebhookTool,
  DeleteWebhookTool,
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

  // ── MODULE 8: Member Management — Complete (24) ────────────────────────────
  SearchMembersTool,
  FilterMembersTool,
  BulkNicknameTool,
  RemoveNicknameTool,
  BulkTimeoutTool,
  BulkRemoveTimeoutTool,
  BulkKickTool,
  BulkBanTool,
  BulkUnbanTool,
  SoftBanTool,
  MassMoveVoiceTool,
  MassServerMuteTool,
  MassServerUnmuteTool,
  MassServerDeafenTool,
  MassServerUndeafenTool,
  AddWarningTool,
  RemoveWarningTool,
  WarningsHistoryTool,
  ModeratorNotesTool,
  RemoveNotesTool,
  MemberHistoryTool,
  MemberStatisticsTool,
  MemberJoinPositionTool,
  ExportMemberDataTool,

  // ── MODULE 9: Message Management — Complete (21) ───────────────────────────
  EditMessageTool,
  UnpinMessageTool,
  BulkPinTool,
  BulkUnpinTool,
  CloneMessageTool,
  CloneEmbedTool,
  CrosspostMessageTool,
  ScheduleMessageTool,
  CancelScheduledMessageTool,
  QuoteMessageTool,
  ForwardMessageTool,
  CopyMessageLinkTool,
  SearchMessagesTool,
  ExportMessagesTool,
  MessageAnalyticsTool,
  TranslateMessageTool,
  RewriteMessageTool,
  FixGrammarTool,
  SummarizeMessageTool,
  ConvertToEmbedTool,
  ConvertEmbedToJsonTool,

  // ── MODULE 10: Permission Management — Complete (12) ───────────────────────
  PermissionCalculatorTool,
  PermissionSimulatorTool,
  PermissionBackupTool,
  PermissionRestoreTool,
  PermissionCompareTool,
  PermissionDiffTool,
  PermissionAuditTool,
  PermissionExplanationTool,
  PermissionRepairTool,
  PermissionResetTool,
  PermissionExportTool,
  PermissionImportTool,
  // MODULE 11: Audit Log
  ViewAuditLogTool,
  AuditLogByModeratorTool,
  AuditLogByTargetTool,
  AuditLogSummaryTool,
  AuditLogSearchTool,
  ExportAuditLogTool,
];
