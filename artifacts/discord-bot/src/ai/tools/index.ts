import type { ITool } from './tool.interface';

// ── Tickets ───────────────────────────────────────────────────────────────────
import { CreateTicketPanelTool } from './create-ticket-panel.tool';
import { ListTicketPanelsTool } from './list-ticket-panels.tool';
import { DeleteTicketPanelTool } from './delete-ticket-panel.tool';
import { ConfigureTicketSettingsTool } from './configure-ticket-settings.tool';
import { TicketDashboardTool } from './ticket-dashboard.tool';

// ── Verification ──────────────────────────────────────────────────────────────
import { CreateVerificationPanelTool } from './create-verification-panel.tool';
import { ListVerificationPanelsTool } from './list-verification-panels.tool';
import { DeleteVerificationPanelTool } from './delete-verification-panel.tool';
import { ConfigureVerificationSettingsTool } from './configure-verification-settings.tool';
import { VerificationDashboardTool } from './verification-dashboard.tool';

// ── Welcome / Goodbye ─────────────────────────────────────────────────────────
import { ConfigureWelcomeTool } from './configure-welcome.tool';
import { ConfigureGoodbyeTool } from './configure-goodbye.tool';
import { ViewWelcomeConfigTool } from './view-welcome-config.tool';

// ── Applications ──────────────────────────────────────────────────────────────
import { CreateApplicationPanelTool } from './create-application-panel.tool';
import { ListApplicationPanelsTool } from './list-application-panels.tool';
import { DeleteApplicationPanelTool } from './delete-application-panel.tool';
import { ApplicationsDashboardTool } from './applications-dashboard.tool';

// ── Server Logging ────────────────────────────────────────────────────────────
import { ConfigureServerLoggingTool } from './configure-server-logging.tool';
import { ViewServerLoggingTool } from './view-server-logging.tool';

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
// MODULE 12: Emoji Management
// ═══════════════════════════════════════════════════════════════════════════════
import { UploadEmojiTool } from './upload-emoji.tool';
import { DeleteEmojiTool } from './delete-emoji.tool';
import { RenameEmojiTool } from './rename-emoji.tool';
import { CloneEmojiTool } from './clone-emoji.tool';
import { ExportEmojiTool } from './export-emoji.tool';
import { ImportEmojiTool } from './import-emoji.tool';
import { EmojiInfoTool } from './emoji-info.tool';
import { EmojiAnalyticsTool } from './emoji-analytics.tool';
import { EmojiCleanupTool } from './emoji-cleanup.tool';
import { EmojiSearchTool } from './emoji-search.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 13: Sticker Management
// ═══════════════════════════════════════════════════════════════════════════════
import { UploadStickerTool } from './upload-sticker.tool';
import { DeleteStickerTool } from './delete-sticker.tool';
import { RenameStickerTool } from './rename-sticker.tool';
import { CloneStickerTool } from './clone-sticker.tool';
import { ExportStickerTool } from './export-sticker.tool';
import { ImportStickerTool } from './import-sticker.tool';
import { StickerInfoTool } from './sticker-info.tool';
import { StickerAnalyticsTool } from './sticker-analytics.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 14: Invite Management
// ═══════════════════════════════════════════════════════════════════════════════
import { DeleteInviteTool } from './delete-invite.tool';
import { ListInvitesTool } from './list-invites.tool';
import { InviteAnalyticsTool } from './invite-analytics.tool';
import { InviteCleanupTool } from './invite-cleanup.tool';
import { InviteInspectorTool } from './invite-inspector.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 16: Webhook Management — Complete
// ═══════════════════════════════════════════════════════════════════════════════
import { RenameWebhookTool } from './rename-webhook.tool';
import { EditWebhookAvatarTool } from './edit-webhook-avatar.tool';
import { MoveWebhookTool } from './move-webhook.tool';
import { SendWebhookMessageTool } from './send-webhook-message.tool';
import { EditWebhookMessageTool } from './edit-webhook-message.tool';
import { DeleteWebhookMessageTool } from './delete-webhook-message.tool';
import { CloneWebhookTool } from './clone-webhook.tool';
import { ExportWebhookTool } from './export-webhook.tool';
import { ImportWebhookTool } from './import-webhook.tool';
import { WebhookInspectorTool } from './webhook-inspector.tool';
import { WebhookAnalyticsTool } from './webhook-analytics.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 17: Scheduled Events — Complete
// ═══════════════════════════════════════════════════════════════════════════════
import { EditScheduledEventTool } from './edit-scheduled-event.tool';
import { StartScheduledEventTool } from './start-scheduled-event.tool';
import { EndScheduledEventTool } from './end-scheduled-event.tool';
import { CancelScheduledEventTool } from './cancel-scheduled-event.tool';
import { DuplicateScheduledEventTool } from './duplicate-scheduled-event.tool';
import { ListScheduledEventsTool } from './list-scheduled-events.tool';
import { ScheduledEventDetailsTool } from './scheduled-event-details.tool';
import { ScheduledEventParticipantsTool } from './scheduled-event-participants.tool';
import { ScheduledEventReminderTool } from './scheduled-event-reminder.tool';
import { ScheduledEventAnalyticsTool } from './scheduled-event-analytics.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 11: Embed System — Complete
// ═══════════════════════════════════════════════════════════════════════════════
import { EditEmbedTool } from './edit-embed.tool';
import { MoveEmbedTool } from './move-embed.tool';
import { ImportEmbedJsonTool } from './import-embed-json.tool';
import { EmbedInspectorTool } from './embed-inspector.tool';
import { EmbedValidatorTool } from './embed-validator.tool';
import { EmbedOptimizerTool } from './embed-optimizer.tool';
import { EmbedPreviewTool } from './embed-preview.tool';
import { EmbedLibraryTool } from './embed-library.tool';
import { SaveEmbedTemplateTool } from './save-embed-template.tool';
import { LoadEmbedTemplateTool } from './load-embed-template.tool';
import { DeleteEmbedTemplateTool } from './delete-embed-template.tool';
import { RenameEmbedTemplateTool } from './rename-embed-template.tool';
import { DuplicateEmbedTemplateTool } from './duplicate-embed-template.tool';
import { ListEmbedTemplatesTool } from './list-embed-templates.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 12: Component System — Complete
// ═══════════════════════════════════════════════════════════════════════════════
import { SendButtonPanelTool } from './send-button-panel.tool';
import { SendStringSelectTool } from './send-string-select.tool';
import { SendRoleSelectTool } from './send-role-select.tool';
import { SendUserSelectTool } from './send-user-select.tool';
import { SendChannelSelectTool } from './send-channel-select.tool';
import { SendMentionableSelectTool } from './send-mentionable-select.tool';
import { SaveModalTemplateTool } from './save-modal-template.tool';
import { ListModalTemplatesTool } from './list-modal-templates.tool';
import { SaveComponentTemplateTool } from './save-component-template.tool';
import { LoadComponentTemplateTool } from './load-component-template.tool';
import { DeleteComponentTemplateTool } from './delete-component-template.tool';
import { ListComponentTemplatesTool } from './list-component-templates.tool';
import { ComponentInspectorTool } from './component-inspector.tool';
import { SendVerificationPanelTool } from './send-verification-panel.tool';
import { SendTicketPanelTool } from './send-ticket-panel.tool';
import { SendRulesPanelTool } from './send-rules-panel.tool';
import { SendWelcomePanelTool } from './send-welcome-panel.tool';
import { SendGiveawayPanelTool } from './send-giveaway-panel.tool';
import { SendAnnouncementPanelTool } from './send-announcement-panel.tool';
import { SendSupportPanelTool } from './send-support-panel.tool';
import { SendApplicationsPanelTool } from './send-applications-panel.tool';
import { SendFaqPanelTool } from './send-faq-panel.tool';
import { SendReactionRolesPanelTool } from './send-reaction-roles-panel.tool';
import { SendModerationPanelTool } from './send-moderation-panel.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 18: AutoMod — Complete
// ═══════════════════════════════════════════════════════════════════════════════
import { CreateAutomodRuleTool } from './create-automod-rule.tool';
import { EditAutomodRuleTool } from './edit-automod-rule.tool';
import { EnableAutomodRuleTool } from './enable-automod-rule.tool';
import { DisableAutomodRuleTool } from './disable-automod-rule.tool';
import { DeleteAutomodRuleTool } from './delete-automod-rule.tool';
import { ListAutomodRulesTool } from './list-automod-rules.tool';
import { AutomodInspectorTool } from './automod-inspector.tool';
import { ExportAutomodRulesTool } from './export-automod-rules.tool';
import { ImportAutomodRulesTool } from './import-automod-rules.tool';
import { AutomodAnalyticsTool } from './automod-analytics.tool';

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

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 19: Audit & Server Inspection
// ═══════════════════════════════════════════════════════════════════════════════
import { AuditLogFilterTool } from './audit-log-filter.tool';
import { AuditTimelineTool } from './audit-timeline.tool';
import { RecentChangesTool } from './recent-changes.tool';
import { RoleChangesLogTool } from './role-changes-log.tool';
import { ChannelChangesLogTool } from './channel-changes-log.tool';
import { PermissionChangesLogTool } from './permission-changes-log.tool';
import { MemberChangesLogTool } from './member-changes-log.tool';
import { ModeratorActivityReportTool } from './moderator-activity-report.tool';
import { SecurityReportTool } from './security-report.tool';
import { ConfigurationReportTool } from './configuration-report.tool';
import { ServerInspectorTool } from './server-inspector.tool';
import { UnusedChannelsReportTool } from './unused-channels-report.tool';
import { UnusedRolesReportTool } from './unused-roles-report.tool';
import { UnusedEmojisReportTool } from './unused-emojis-report.tool';
import { UnusedStickersReportTool } from './unused-stickers-report.tool';
import { DuplicateResourceDetectionTool } from './duplicate-resource-detection.tool';
import { BrokenPermissionDetectionTool } from './broken-permission-detection.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 20: Analytics
// ═══════════════════════════════════════════════════════════════════════════════
import { ServerAnalyticsTool } from './server-analytics.tool';
import { MemberAnalyticsTool } from './member-analytics.tool';
import { ChannelAnalyticsTool } from './channel-analytics.tool';
import { RoleAnalyticsTool } from './role-analytics.tool';
import { VoiceAnalyticsTool } from './voice-analytics.tool';
import { ActivityAnalyticsTool } from './activity-analytics.tool';
import { GrowthAnalyticsTool } from './growth-analytics.tool';
import { RetentionAnalyticsTool } from './retention-analytics.tool';
import { EngagementAnalyticsTool } from './engagement-analytics.tool';
import { ReactionAnalyticsTool } from './reaction-analytics.tool';
import { BoostAnalyticsTool } from './boost-analytics.tool';
import { LeaderboardAnalyticsTool } from './leaderboard-analytics.tool';
import { TrendAnalysisTool } from './trend-analysis.tool';
import { HeatmapGenerationTool } from './heatmap-generation.tool';
import { DailyReportTool } from './daily-report.tool';
import { WeeklyReportTool } from './weekly-report.tool';
import { MonthlyReportTool } from './monthly-report.tool';
import { ExportAnalyticsTool } from './export-analytics.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 21: Server Backup
// ═══════════════════════════════════════════════════════════════════════════════
import { BackupServerTool } from './backup-server.tool';
import { RestoreServerTool } from './restore-server.tool';
import { IncrementalBackupTool } from './incremental-backup.tool';
import { CreateSnapshotTool } from './create-snapshot.tool';
import { CompareSnapshotsTool } from './compare-snapshots.tool';
import { ListSnapshotsTool } from './list-snapshots.tool';
import { ExportBackupTool } from './export-backup.tool';
import { ImportBackupTool } from './import-backup.tool';
import { SelectiveRestoreTool } from './selective-restore.tool';
import { VerifyBackupTool } from './verify-backup.tool';
import { InspectBackupTool } from './inspect-backup.tool';
import { CleanupBackupsTool } from './cleanup-backups.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 22: Server Template
// ═══════════════════════════════════════════════════════════════════════════════
import { CreateServerTemplateTool } from './create-server-template.tool';
import { ExportServerTemplateTool } from './export-server-template.tool';
import { ImportServerTemplateTool } from './import-server-template.tool';
import { DuplicateServerTemplateTool } from './duplicate-server-template.tool';
import { EditServerTemplateTool } from './edit-server-template.tool';
import { DeleteServerTemplateTool } from './delete-server-template.tool';
import { ListServerTemplatesTool } from './list-server-templates.tool';
import { ValidateServerTemplateTool } from './validate-server-template.tool';
import { ApplyServerTemplateTool } from './apply-server-template.tool';
import { PreviewServerTemplateTool } from './preview-server-template.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 23: Server Clone
// ═══════════════════════════════════════════════════════════════════════════════
import { CloneAllCategoriesTool } from './clone-all-categories.tool';
import { CloneAllChannelsTool } from './clone-all-channels.tool';
import { CloneAllRolesTool } from './clone-all-roles.tool';
import { ClonePermissionsStructureTool } from './clone-permissions-structure.tool';
import { CloneAllEmojisTool } from './clone-all-emojis.tool';
import { CloneAllStickersTool } from './clone-all-stickers.tool';
import { CloneServerStructureTool } from './clone-server-structure.tool';
import { CloneServerConfigTool } from './clone-server-config.tool';
import { CloneCompleteLayoutTool } from './clone-complete-layout.tool';
import { PartialCloneTool } from './partial-clone.tool';
import { ClonePreviewTool } from './clone-preview.tool';

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 24: Server Utilities
// ═══════════════════════════════════════════════════════════════════════════════
import { CleanupEmptyChannelsTool } from './cleanup-empty-channels.tool';
import { CleanupEmptyCatsTool } from './cleanup-empty-categories.tool';
import { CleanupUnusedRolesTool } from './cleanup-unused-roles.tool';
import { CleanupUnusedEmojisTool } from './cleanup-unused-emojis.tool';
import { CleanupUnusedStickersTool } from './cleanup-unused-stickers.tool';
import { CleanupExpiredInvitesTool } from './cleanup-expired-invites.tool';
import { CleanupInactiveThreadsTool } from './cleanup-inactive-threads.tool';
import { OptimizeCategoriesTool } from './optimize-categories.tool';
import { OptimizePermissionsTool } from './optimize-permissions.tool';
import { OptimizeRolesTool } from './optimize-roles.tool';
import { OptimizeChannelLayoutTool } from './optimize-channel-layout.tool';
import { GenerateServerDocsTool } from './generate-server-docs.tool';
import { GeneratePermissionDocsTool } from './generate-permission-docs.tool';
import { GenerateRoleDocsTool } from './generate-role-docs.tool';
import { GenerateChannelDocsTool } from './generate-channel-docs.tool';
import { GenerateConfigDocsTool } from './generate-config-docs.tool';

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

  // ── MODULE 12: Emoji Management (10) ────────────────────────────────────────
  UploadEmojiTool,
  DeleteEmojiTool,
  RenameEmojiTool,
  CloneEmojiTool,
  ExportEmojiTool,
  ImportEmojiTool,
  EmojiInfoTool,
  EmojiAnalyticsTool,
  EmojiCleanupTool,
  EmojiSearchTool,

  // ── MODULE 13: Sticker Management (8) ───────────────────────────────────────
  UploadStickerTool,
  DeleteStickerTool,
  RenameStickerTool,
  CloneStickerTool,
  ExportStickerTool,
  ImportStickerTool,
  StickerInfoTool,
  StickerAnalyticsTool,

  // ── MODULE 14: Invite Management (5 new, + existing create_invite) ─────────
  DeleteInviteTool,
  ListInvitesTool,
  InviteAnalyticsTool,
  InviteCleanupTool,
  InviteInspectorTool,

  // ── MODULE 16: Webhook Management (11 new, + existing create/delete) ───────
  RenameWebhookTool,
  EditWebhookAvatarTool,
  MoveWebhookTool,
  SendWebhookMessageTool,
  EditWebhookMessageTool,
  DeleteWebhookMessageTool,
  CloneWebhookTool,
  ExportWebhookTool,
  ImportWebhookTool,
  WebhookInspectorTool,
  WebhookAnalyticsTool,

  // ── MODULE 17: Scheduled Events (10 new, + existing create/delete) ─────────
  EditScheduledEventTool,
  StartScheduledEventTool,
  EndScheduledEventTool,
  CancelScheduledEventTool,
  DuplicateScheduledEventTool,
  ListScheduledEventsTool,
  ScheduledEventDetailsTool,
  ScheduledEventParticipantsTool,
  ScheduledEventReminderTool,
  ScheduledEventAnalyticsTool,

  // ── MODULE 18: AutoMod (10) ──────────────────────────────────────────────
  CreateAutomodRuleTool,
  EditAutomodRuleTool,
  EnableAutomodRuleTool,
  DisableAutomodRuleTool,
  DeleteAutomodRuleTool,
  ListAutomodRulesTool,
  AutomodInspectorTool,
  ExportAutomodRulesTool,
  ImportAutomodRulesTool,
  AutomodAnalyticsTool,

  // ── MODULE 11: Embed System — Complete (14) ──────────────────────────────
  EditEmbedTool,
  MoveEmbedTool,
  ImportEmbedJsonTool,
  EmbedInspectorTool,
  EmbedValidatorTool,
  EmbedOptimizerTool,
  EmbedPreviewTool,
  EmbedLibraryTool,
  SaveEmbedTemplateTool,
  LoadEmbedTemplateTool,
  DeleteEmbedTemplateTool,
  RenameEmbedTemplateTool,
  DuplicateEmbedTemplateTool,
  ListEmbedTemplatesTool,

  // ── MODULE 12: Component System — Selects & Buttons (7) ─────────────────
  SendButtonPanelTool,
  SendStringSelectTool,
  SendRoleSelectTool,
  SendUserSelectTool,
  SendChannelSelectTool,
  SendMentionableSelectTool,

  // ── MODULE 12: Component System — Modals (2) ────────────────────────────
  SaveModalTemplateTool,
  ListModalTemplatesTool,

  // ── MODULE 12: Component System — Management (5) ────────────────────────
  SaveComponentTemplateTool,
  LoadComponentTemplateTool,
  DeleteComponentTemplateTool,
  ListComponentTemplatesTool,
  ComponentInspectorTool,

  // ── MODULE 12: UI Templates — Pre-built Panels (11) ─────────────────────
  SendVerificationPanelTool,
  SendTicketPanelTool,
  SendRulesPanelTool,
  SendWelcomePanelTool,
  SendGiveawayPanelTool,
  SendAnnouncementPanelTool,
  SendSupportPanelTool,
  SendApplicationsPanelTool,
  SendFaqPanelTool,
  SendReactionRolesPanelTool,
  SendModerationPanelTool,

  // ── MODULE 19: Audit & Server Inspection (17) ────────────────────────────
  AuditLogFilterTool,
  AuditTimelineTool,
  RecentChangesTool,
  RoleChangesLogTool,
  ChannelChangesLogTool,
  PermissionChangesLogTool,
  MemberChangesLogTool,
  ModeratorActivityReportTool,
  SecurityReportTool,
  ConfigurationReportTool,
  ServerInspectorTool,
  UnusedChannelsReportTool,
  UnusedRolesReportTool,
  UnusedEmojisReportTool,
  UnusedStickersReportTool,
  DuplicateResourceDetectionTool,
  BrokenPermissionDetectionTool,

  // ── MODULE 20: Analytics (18) ────────────────────────────────────────────
  ServerAnalyticsTool,
  MemberAnalyticsTool,
  ChannelAnalyticsTool,
  RoleAnalyticsTool,
  VoiceAnalyticsTool,
  ActivityAnalyticsTool,
  GrowthAnalyticsTool,
  RetentionAnalyticsTool,
  EngagementAnalyticsTool,
  ReactionAnalyticsTool,
  BoostAnalyticsTool,
  LeaderboardAnalyticsTool,
  TrendAnalysisTool,
  HeatmapGenerationTool,
  DailyReportTool,
  WeeklyReportTool,
  MonthlyReportTool,
  ExportAnalyticsTool,

  // ── MODULE 21: Server Backup (12) ────────────────────────────────────────
  BackupServerTool,
  RestoreServerTool,
  IncrementalBackupTool,
  CreateSnapshotTool,
  CompareSnapshotsTool,
  ListSnapshotsTool,
  ExportBackupTool,
  ImportBackupTool,
  SelectiveRestoreTool,
  VerifyBackupTool,
  InspectBackupTool,
  CleanupBackupsTool,

  // ── MODULE 22: Server Template (10) ──────────────────────────────────────
  CreateServerTemplateTool,
  ExportServerTemplateTool,
  ImportServerTemplateTool,
  DuplicateServerTemplateTool,
  EditServerTemplateTool,
  DeleteServerTemplateTool,
  ListServerTemplatesTool,
  ValidateServerTemplateTool,
  ApplyServerTemplateTool,
  PreviewServerTemplateTool,

  // ── MODULE 23: Server Clone (11) ─────────────────────────────────────────
  CloneAllCategoriesTool,
  CloneAllChannelsTool,
  CloneAllRolesTool,
  ClonePermissionsStructureTool,
  CloneAllEmojisTool,
  CloneAllStickersTool,
  CloneServerStructureTool,
  CloneServerConfigTool,
  CloneCompleteLayoutTool,
  PartialCloneTool,
  ClonePreviewTool,

  // ── MODULE 24: Server Utilities (16) ─────────────────────────────────────
  CleanupEmptyChannelsTool,
  CleanupEmptyCatsTool,
  CleanupUnusedRolesTool,
  CleanupUnusedEmojisTool,
  CleanupUnusedStickersTool,
  CleanupExpiredInvitesTool,
  CleanupInactiveThreadsTool,
  OptimizeCategoriesTool,
  OptimizePermissionsTool,
  OptimizeRolesTool,
  OptimizeChannelLayoutTool,
  GenerateServerDocsTool,
  GeneratePermissionDocsTool,
  GenerateRoleDocsTool,
  GenerateChannelDocsTool,
  GenerateConfigDocsTool,

  // ── MODULE 25: Tickets (5) ────────────────────────────────────────────────
  CreateTicketPanelTool,
  ListTicketPanelsTool,
  DeleteTicketPanelTool,
  ConfigureTicketSettingsTool,
  TicketDashboardTool,

  // ── MODULE 26: Verification (5) ───────────────────────────────────────────
  CreateVerificationPanelTool,
  ListVerificationPanelsTool,
  DeleteVerificationPanelTool,
  ConfigureVerificationSettingsTool,
  VerificationDashboardTool,

  // ── MODULE 27: Welcome / Goodbye (3) ──────────────────────────────────────
  ConfigureWelcomeTool,
  ConfigureGoodbyeTool,
  ViewWelcomeConfigTool,

  // ── MODULE 28: Applications (4) ────────────────────────────────────────────
  CreateApplicationPanelTool,
  ListApplicationPanelsTool,
  DeleteApplicationPanelTool,
  ApplicationsDashboardTool,

  // ── MODULE 29: Server Logging (2) ─────────────────────────────────────────
  ConfigureServerLoggingTool,
  ViewServerLoggingTool,
];
