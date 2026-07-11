export type CategoryKey =
  | 'server' | 'channels' | 'categories' | 'roles' | 'members'
  | 'moderation' | 'messages' | 'embeds' | 'voice' | 'emojis'
  | 'stickers' | 'invites' | 'automod' | 'events' | 'webhooks'
  | 'permissions' | 'analytics' | 'backup' | 'templates' | 'clone'
  | 'panels' | 'utilities' | 'tickets' | 'verification' | 'welcome' | 'applications' | 'serverlogs';

export interface CategoryMeta {
  label: string;
  emoji: string;
  description: string;
  color: number;
}

export const CATEGORY_META: Record<CategoryKey, CategoryMeta> = {
  server:      { label: 'Server',        emoji: '🏰', description: 'Server settings and configuration',  color: 0x5865f2 },
  channels:    { label: 'Channels',      emoji: '💬', description: 'Text, voice, and forum channels',    color: 0x57f287 },
  categories:  { label: 'Categories',   emoji: '📁', description: 'Channel category management',        color: 0x57f287 },
  roles:       { label: 'Roles',         emoji: '🎭', description: 'Role management and permissions',   color: 0xfee75c },
  members:     { label: 'Members',       emoji: '👥', description: 'Member management and info',         color: 0x5865f2 },
  moderation:  { label: 'Moderation',    emoji: '🔨', description: 'Bans, kicks, timeouts, warnings',   color: 0xed4245 },
  messages:    { label: 'Messages',      emoji: '✉️',  description: 'Message operations',                color: 0x5865f2 },
  embeds:      { label: 'Embeds & UI',   emoji: '🎨', description: 'Embeds, components, modals',        color: 0xf47fff },
  voice:       { label: 'Voice',         emoji: '🔊', description: 'Voice channels and members',        color: 0x5865f2 },
  emojis:      { label: 'Emojis',        emoji: '😀', description: 'Custom emoji management',           color: 0xfee75c },
  stickers:    { label: 'Stickers',      emoji: '🎉', description: 'Custom sticker management',         color: 0xfee75c },
  invites:     { label: 'Invites',       emoji: '🔗', description: 'Invite management',                 color: 0x57f287 },
  automod:     { label: 'AutoMod',       emoji: '🛡️', description: 'AutoMod rules and configuration',   color: 0xf5a623 },
  events:      { label: 'Events',        emoji: '📅', description: 'Scheduled events',                  color: 0x57f287 },
  webhooks:    { label: 'Webhooks',      emoji: '🔌', description: 'Webhook management',                color: 0x5865f2 },
  permissions: { label: 'Permissions',   emoji: '🔐', description: 'Permission management',             color: 0xf5a623 },
  analytics:   { label: 'Analytics',     emoji: '📊', description: 'Stats, reports and analytics',      color: 0x5865f2 },
  backup:      { label: 'Backup',        emoji: '💾', description: 'Server backup and restore',         color: 0x5865f2 },
  templates:   { label: 'Templates',     emoji: '📋', description: 'Server templates',                  color: 0x5865f2 },
  clone:       { label: 'Clone',         emoji: '🔄', description: 'Clone server elements',             color: 0x5865f2 },
  panels:      { label: 'Panels',        emoji: '🖥️', description: 'Interactive panels and UI',         color: 0xf47fff },
  utilities:   { label: 'Utilities',     emoji: '🔧', description: 'Utilities and misc tools',          color: 0x5865f2 },
  tickets:     { label: 'Tickets',       emoji: '🎫', description: 'Ticket panels, settings, and stats', color: 0x5865f2 },
  verification:{ label: 'Verification',  emoji: '✅', description: 'Verification panels and gating',   color: 0x57f287 },
  welcome:     { label: 'Welcome/Goodbye', emoji: '👋', description: 'Join and leave messages',        color: 0x57f287 },
  applications:{ label: 'Applications',  emoji: '📨', description: 'Application panels and reviews',  color: 0x5865f2 },
  serverlogs:  { label: 'Server Logging', emoji: '📋', description: 'Message, member, and voice logs', color: 0x99aab5 },
};

export const CATEGORY_ORDER: CategoryKey[] = [
  'server', 'channels', 'categories', 'roles', 'members',
  'moderation', 'messages', 'embeds', 'voice', 'emojis',
  'stickers', 'invites', 'automod', 'events', 'webhooks',
  'permissions', 'analytics', 'backup', 'templates', 'clone',
  'panels', 'utilities', 'tickets', 'verification', 'welcome', 'applications', 'serverlogs',
];

export function inferCategory(toolName: string): CategoryKey {
  const n = toolName.toLowerCase();

  if (n.includes('ticket'))                                                    return 'tickets';
  if (n.includes('verification') || n === 'verify_member')                     return 'verification';
  if (n.includes('welcome') || n.includes('goodbye'))                          return 'welcome';
  if (n.includes('application'))                                               return 'applications';
  if (n.includes('server_logging'))                                            return 'serverlogs';
  if (n.includes('automod'))                                                   return 'automod';
  if (n.includes('emoji') && !n.endsWith('_analytics'))                        return 'emojis';
  if (n.includes('sticker') && !n.endsWith('_analytics'))                      return 'stickers';
  if (n.includes('webhook') && !n.endsWith('_analytics'))                      return 'webhooks';
  if (n.includes('invite') && !n.endsWith('_analytics'))                       return 'invites';
  if (n.includes('permission') || n === 'broken_permission_detection' || n === 'optimize_permissions') return 'permissions';
  if (n.includes('template') && !n.includes('embed_template') && !n.includes('component_template') && !n.includes('modal_template')) return 'templates';
  if (n.startsWith('clone') || n === 'partial_clone')                          return 'clone';
  if (n.includes('backup') || n.includes('snapshot') || n === 'restore_server' || n === 'selective_restore' || n === 'incremental_backup' || n === 'inspect_backup' || n === 'verify_backup' || n === 'cleanup_backups' || n === 'compare_snapshots') return 'backup';
  if (n.endsWith('_analytics') || n.endsWith('_report') || n.startsWith('daily_') || n.startsWith('weekly_') || n.startsWith('monthly_') || n === 'heatmap_generation' || n === 'trend_analysis' || n === 'export_analytics' || n === 'leaderboard_analytics' || n === 'engagement_analytics' || n === 'growth_analytics' || n === 'retention_analytics' || n === 'boost_analytics') return 'analytics';
  if (n.includes('embed') || n.includes('embed_template') || n.includes('component_template') || n.includes('modal_template') || n === 'component_inspector') return 'embeds';
  if (n.startsWith('send_') && n !== 'send_message' && n !== 'send_webhook_message' && n !== 'send_announcement') return 'panels';
  if (n.includes('scheduled_event') || n === 'duplicate_scheduled_event' || n === 'start_scheduled_event' || n === 'end_scheduled_event' || n === 'cancel_scheduled_event' || n === 'create_scheduled_event' || n === 'delete_scheduled_event' || n === 'edit_scheduled_event' || n === 'list_scheduled_events') return 'events';
  if (n.includes('voice') || n.startsWith('mass_server_') || n.startsWith('mass_move_voice') || n === 'disconnect_all_voice') return 'voice';
  if (n === 'ban_member' || n === 'unban_member' || n === 'kick_member' || n === 'soft_ban' || n.startsWith('bulk_ban') || n.startsWith('bulk_kick') || n.startsWith('bulk_unban') || n.startsWith('bulk_timeout') || n.startsWith('bulk_remove_timeout') || n === 'timeout_member' || n === 'remove_timeout' || n.includes('warning') || n === 'moderator_notes' || n === 'remove_notes' || n === 'moderator_activity_report') return 'moderation';
  if (n.includes('thread') || n.includes('channel') || n === 'pin_message' || n === 'unpin_message' || n === 'bulk_pin' || n === 'bulk_unpin' || n === 'set_forum_guidelines' || n === 'add_forum_tag') return 'channels';
  if (n.includes('categor'))                                                   return 'categories';
  if (n.includes('role') || n === 'bulk_assign_role' || n === 'bulk_remove_role') return 'roles';
  if (n.includes('member') || n.includes('nickname') || n === 'assign_role' || n === 'remove_role' || n === 'filter_members' || n === 'search_members') return 'members';
  if (n.includes('message') || n.startsWith('forward_') || n.startsWith('quote_') || n === 'copy_message_link' || n.startsWith('summarize_') || n.startsWith('rewrite_') || n.startsWith('translate_') || n === 'fix_grammar' || n === 'crosspost_message' || n === 'send_message' || n === 'send_webhook_message' || n === 'send_announcement' || n === 'schedule_message' || n === 'cancel_scheduled_message' || n === 'search_messages' || n === 'clone_message') return 'messages';
  if (n.includes('guild') || n.includes('server') || n.startsWith('security_') || n.startsWith('configure_') || n === 'edit_guild' || n === 'view_guild_info' || n === 'guild_health_check' || n === 'recent_changes' || n === 'server_inspector' || n.startsWith('generate_server')) return 'server';

  return 'utilities';
}

export function toolDisplayName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
