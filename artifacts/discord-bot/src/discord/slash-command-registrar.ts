import { REST, Routes, ApplicationCommandOptionType } from 'discord.js';
import { logger } from '../utils/logger';

const AI_COMMAND = {
  name: 'ai',
  description: 'Send a natural language command to the AI Control Center',
  options: [
    {
      name: 'prompt',
      type: ApplicationCommandOptionType.String,
      description: 'What would you like the AI to do? (e.g. "Create a ticket system")',
      required: true,
      min_length: 1,
      max_length: 1000,
    },
  ],
};

const FORGET_COMMAND = {
  name: 'forget',
  description: 'Clear your AI conversation memory for this server and start fresh',
};

const MEMORY_COMMAND = {
  name: 'memory',
  description: 'Show your current AI conversation memory and active context',
};

const PREFERENCES_COMMAND = {
  name: 'preferences',
  description: 'Show your stored long-term AI preferences',
};

const RESET_PREFS_COMMAND = {
  name: 'resetpreferences',
  description: 'Reset all your stored long-term AI preferences',
};

const WORKSPACE_COMMAND = {
  name: 'workspace',
  description: 'Manage AI workspaces — named, resumable conversation sessions',
  options: [
    {
      name: 'start',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Start a new named workspace',
      options: [
        {
          name: 'name',
          type: ApplicationCommandOptionType.String,
          description: 'Workspace name (e.g. "Ticket System", "Server Setup")',
          required: true,
        },
        {
          name: 'description',
          type: ApplicationCommandOptionType.String,
          description: 'Optional description for this workspace',
          required: false,
        },
      ],
    },
    {
      name: 'resume',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Resume a previous workspace by name',
      options: [
        {
          name: 'name',
          type: ApplicationCommandOptionType.String,
          description: 'Name of the workspace to resume',
          required: true,
        },
      ],
    },
    {
      name: 'end',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'End the current workspace (keeps it saved for later)',
    },
    {
      name: 'list',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'List all your saved workspaces',
    },
    {
      name: 'delete',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Permanently delete a workspace',
      options: [
        {
          name: 'name',
          type: ApplicationCommandOptionType.String,
          description: 'Name of the workspace to delete',
          required: true,
        },
      ],
    },
  ],
};

const VOICE_COMMAND = {
  name: 'voice',
  description: 'Control the Voice AI assistant (join, leave, status)',
  options: [
    {
      name: 'join',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Join your current voice channel and start listening',
    },
    {
      name: 'leave',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Leave the voice channel',
    },
    {
      name: 'status',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Show Voice AI status for this server',
    },
    {
      name: 'personality',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Change the voice personality',
      options: [
        {
          name: 'type',
          type: ApplicationCommandOptionType.String,
          description: 'Personality type',
          required: true,
          choices: [
            { name: 'Friendly', value: 'friendly' },
            { name: 'Professional', value: 'professional' },
            { name: 'Gaming', value: 'gaming' },
            { name: 'Funny', value: 'funny' },
            { name: 'Assistant', value: 'assistant' },
          ],
        },
      ],
    },
  ],
};

const TICKET_COMMAND = {
  name: 'ticket',
  description: 'Manage the ticket in this channel',
  options: [
    {
      name: 'claim',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Claim this ticket',
    },
    {
      name: 'unclaim',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Release the current claim on this ticket',
    },
    {
      name: 'lock',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Lock this ticket so only staff can send messages',
    },
    {
      name: 'unlock',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Unlock a previously locked ticket',
    },
    {
      name: 'rename',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Rename this ticket channel',
      options: [
        {
          name: 'name',
          type: ApplicationCommandOptionType.String,
          description: 'New channel name',
          required: true,
          min_length: 1,
          max_length: 90,
        },
      ],
    },
    {
      name: 'add',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Add a user to this ticket',
      options: [
        {
          name: 'user',
          type: ApplicationCommandOptionType.User,
          description: 'User to add (mention or ID)',
          required: true,
        },
      ],
    },
    {
      name: 'remove',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Remove a user from this ticket',
      options: [
        {
          name: 'user',
          type: ApplicationCommandOptionType.User,
          description: 'User to remove (mention or ID)',
          required: true,
        },
      ],
    },
    {
      name: 'priority',
      type: ApplicationCommandOptionType.Subcommand,
      description: "Set this ticket's priority",
      options: [
        {
          name: 'level',
          type: ApplicationCommandOptionType.String,
          description: 'Priority level',
          required: true,
          choices: [
            { name: 'Low', value: 'low' },
            { name: 'Normal', value: 'normal' },
            { name: 'High', value: 'high' },
            { name: 'Urgent', value: 'urgent' },
          ],
        },
      ],
    },
    {
      name: 'transcript',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Generate and attach a transcript of this ticket',
    },
    {
      name: 'close',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Close this ticket',
    },
    {
      name: 'reopen',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Reopen a closed ticket',
    },
    {
      name: 'delete',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Permanently delete this ticket channel',
    },
    {
      name: 'info',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Show information about this ticket',
    },
  ],
};

// ── Moderation System Pro Commands ────────────────────────────────────────

const WARN_COMMAND = {
  name: 'warn', description: 'Issue a warning to a member',
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to warn', required: true },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the warning', required: false, max_length: 500 },
  ],
};

const UNWARN_COMMAND = {
  name: 'unwarn', description: 'Remove a specific warning by case ID',
  options: [
    { name: 'case_id', type: ApplicationCommandOptionType.String, description: 'Case ID of the warning (e.g. MOD-0003)', required: true },
  ],
};

const WARNINGS_COMMAND = {
  name: 'warnings', description: "View all warnings for a member",
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to check', required: true },
  ],
};

const CLEARWARNINGS_COMMAND = {
  name: 'clearwarnings', description: "Clear all active warnings for a member",
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member whose warnings to clear', required: true },
  ],
};

const MUTE_COMMAND = {
  name: 'mute', description: 'Timeout (mute) a member for a duration',
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to mute', required: true },
    { name: 'duration', type: ApplicationCommandOptionType.String, description: 'Duration: 10m, 1h, 7d (max 28d)', required: true },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the mute', required: false, max_length: 500 },
  ],
};

const TEMPTIMEOUT_COMMAND = {
  name: 'temptimeout', description: 'Apply a temporary timeout to a member (alias for /mute)',
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to timeout', required: true },
    { name: 'duration', type: ApplicationCommandOptionType.String, description: 'Duration: 10m, 1h, 7d (max 28d)', required: true },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the timeout', required: false, max_length: 500 },
  ],
};

const UNMUTE_COMMAND = {
  name: 'unmute', description: 'Remove timeout from a member',
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to unmute', required: true },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for removing the timeout', required: false, max_length: 500 },
  ],
};

const KICK_COMMAND = {
  name: 'kick', description: 'Kick a member from the server',
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to kick', required: true },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the kick', required: false, max_length: 500 },
  ],
};

const BAN_COMMAND = {
  name: 'ban', description: 'Ban a member from the server',
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to ban', required: true },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the ban', required: false, max_length: 500 },
    { name: 'delete_days', type: ApplicationCommandOptionType.Integer, description: 'Days of messages to delete (0-7)', required: false, min_value: 0, max_value: 7 },
  ],
};

const TEMPBAN_COMMAND = {
  name: 'tempban', description: 'Temporarily ban a member — auto-unbanned on expiry',
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to temp-ban', required: true },
    { name: 'duration', type: ApplicationCommandOptionType.String, description: 'Duration: 1h, 7d, 2w', required: true },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the temp ban', required: false, max_length: 500 },
  ],
};

const UNBAN_COMMAND = {
  name: 'unban', description: 'Unban a user from the server by user ID',
  options: [
    { name: 'user_id', type: ApplicationCommandOptionType.String, description: 'User ID of the banned member', required: true },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the unban', required: false, max_length: 500 },
  ],
};

const SOFTBAN_COMMAND = {
  name: 'softban', description: 'Softban — bans then immediately unbans to purge message history',
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to softban', required: true },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for the softban', required: false, max_length: 500 },
  ],
};

const PURGE_COMMAND = {
  name: 'purge', description: 'Bulk delete messages in this channel (up to 100)',
  options: [
    { name: 'amount', type: ApplicationCommandOptionType.Integer, description: 'Number of messages to delete (1-100)', required: true, min_value: 1, max_value: 100 },
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Only delete messages from this user', required: false },
    { name: 'channel', type: ApplicationCommandOptionType.Channel, description: 'Channel to purge (defaults to current)', required: false },
  ],
};

const SLOWMODE_COMMAND = {
  name: 'slowmode', description: 'Set slowmode in a channel (0 to disable)',
  options: [
    { name: 'seconds', type: ApplicationCommandOptionType.Integer, description: 'Slowmode delay in seconds (0 = off, max 21600)', required: true, min_value: 0, max_value: 21600 },
    { name: 'channel', type: ApplicationCommandOptionType.Channel, description: 'Channel to apply slowmode (defaults to current)', required: false },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason', required: false, max_length: 500 },
  ],
};

const NICK_COMMAND = {
  name: 'nick', description: "Set or reset a member's nickname",
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to nickname', required: true },
    { name: 'nickname', type: ApplicationCommandOptionType.String, description: 'New nickname (leave blank to reset)', required: false, max_length: 32 },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason', required: false, max_length: 500 },
  ],
};

const LOCK_COMMAND = {
  name: 'lock', description: 'Lock a channel — prevents members from sending messages',
  options: [
    { name: 'channel', type: ApplicationCommandOptionType.Channel, description: 'Channel to lock (defaults to current)', required: false },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for locking', required: false, max_length: 500 },
  ],
};

const UNLOCK_COMMAND = {
  name: 'unlock', description: 'Unlock a previously locked channel',
  options: [
    { name: 'channel', type: ApplicationCommandOptionType.Channel, description: 'Channel to unlock (defaults to current)', required: false },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason for unlocking', required: false, max_length: 500 },
  ],
};

const ROLE_COMMAND = {
  name: 'role',
  description: 'Manage roles and temporary role assignments',
  options: [
    {
      name: 'add',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Add a role to a member (optionally with a duration for auto-removal)',
      options: [
        { name: 'user',     type: ApplicationCommandOptionType.User,   description: 'Target member',                                                            required: true  },
        { name: 'role',     type: ApplicationCommandOptionType.Role,   description: 'Role to add',                                                              required: true  },
        { name: 'reason',   type: ApplicationCommandOptionType.String, description: 'Reason',                                                                   required: false, max_length: 500 },
        { name: 'duration', type: ApplicationCommandOptionType.String, description: 'Auto-remove after this time (e.g. 30s, 5m, 2h, 3d, 1w, 1mo)',             required: false, max_length: 10  },
      ],
    },
    {
      name: 'remove',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Remove a role from a member',
      options: [
        { name: 'user',   type: ApplicationCommandOptionType.User,   description: 'Target member',  required: true  },
        { name: 'role',   type: ApplicationCommandOptionType.Role,   description: 'Role to remove', required: true  },
        { name: 'reason', type: ApplicationCommandOptionType.String, description: 'Reason',         required: false, max_length: 500 },
      ],
    },
    {
      name: 'list-temp',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'List all active temporary roles in this server',
      options: [],
    },
    {
      name: 'extend',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Add more time to an existing temporary role',
      options: [
        { name: 'user',     type: ApplicationCommandOptionType.User,   description: 'Member with the temporary role',  required: true  },
        { name: 'role',     type: ApplicationCommandOptionType.Role,   description: 'The temporary role to extend',    required: true  },
        { name: 'duration', type: ApplicationCommandOptionType.String, description: 'Time to add (e.g. 1h, 2d)',       required: true, max_length: 10 },
      ],
    },
    {
      name: 'reduce',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Subtract time from an existing temporary role',
      options: [
        { name: 'user',     type: ApplicationCommandOptionType.User,   description: 'Member with the temporary role',  required: true  },
        { name: 'role',     type: ApplicationCommandOptionType.Role,   description: 'The temporary role to reduce',    required: true  },
        { name: 'duration', type: ApplicationCommandOptionType.String, description: 'Time to subtract (e.g. 1h, 2d)', required: true, max_length: 10 },
      ],
    },
    {
      name: 'remove-temp',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Immediately remove a temporary role and cancel its timer',
      options: [
        { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to remove the role from', required: true },
        { name: 'role', type: ApplicationCommandOptionType.Role, description: 'The temporary role to remove',   required: true },
      ],
    },
  ],
};

const CASE_COMMAND = {
  name: 'case', description: 'View the full details of a moderation case',
  options: [
    { name: 'id', type: ApplicationCommandOptionType.String, description: 'Case ID (e.g. MOD-0042)', required: true },
  ],
};

const HISTORY_COMMAND = {
  name: 'history', description: "View a member's complete moderation history",
  options: [
    { name: 'user', type: ApplicationCommandOptionType.User, description: 'Member to look up', required: true },
    { name: 'page', type: ApplicationCommandOptionType.Integer, description: 'Page number (default 1)', required: false, min_value: 1 },
  ],
};

const EDITCASE_COMMAND = {
  name: 'editcase', description: 'Edit the reason of a moderation case',
  options: [
    { name: 'id', type: ApplicationCommandOptionType.String, description: 'Case ID to edit', required: true },
    { name: 'reason', type: ApplicationCommandOptionType.String, description: 'New reason', required: true, max_length: 500 },
  ],
};

const DELETECASE_COMMAND = {
  name: 'deletecase', description: '[Admin] Permanently delete a moderation case',
  options: [
    { name: 'id', type: ApplicationCommandOptionType.String, description: 'Case ID to delete', required: true },
  ],
};

// ── Staff Management Pro Commands ─────────────────────────────────────────

const SHIFT_COMMAND = {
  name: 'shift',
  description: 'Manage your staff shift',
  options: [
    {
      name: 'start',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Start your shift',
    },
    {
      name: 'end',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'End your current shift',
    },
    {
      name: 'status',
      type: ApplicationCommandOptionType.Subcommand,
      description: 'Show your current shift status',
    },
  ],
};

const STORE_COMMAND = {
  name: 'store',
  description: '[Admin] Store Management System — manage categories, products, orders, payments, and more',
  options: [
    // ── Phase 1 ──────────────────────────────────────────────────────────────
    {
      name: 'panel',
      description: 'Post the store panel to the current channel',
      type: 1,
    },
    {
      name: 'stats',
      description: 'View store statistics',
      type: 1,
    },
    // ── Phase 2 new top-level ─────────────────────────────────────────────────
    {
      name: 'dashboard',
      description: 'Open the admin store dashboard with revenue charts and top stats',
      type: 1,
    },
    {
      name: 'settings',
      description: 'Open the store settings panel (categories, payments, roles, logs)',
      type: 1,
    },
    {
      name: 'search',
      description: 'Search for products by name, tag, category, or ID',
      type: 1,
      options: [
        { name: 'query', description: 'Search query', type: 3, required: false },
      ],
    },
    {
      name: 'audit',
      description: 'View the store audit log (recent 25 entries)',
      type: 1,
    },
    {
      name: 'export',
      description: 'Export orders as CSV or JSON',
      type: 1,
      options: [
        {
          name: 'format',
          description: 'Export format (default: json)',
          type: 3,
          required: false,
          choices: [
            { name: 'JSON', value: 'json' },
            { name: 'CSV', value: 'csv' },
          ],
        },
      ],
    },
    // ── Phase 1 category group ────────────────────────────────────────────────
    {
      name: 'category',
      description: 'Manage store categories',
      type: 2,
      options: [
        {
          name: 'add',
          description: 'Add a new product category',
          type: 1,
          options: [
            { name: 'name', description: 'Category name (e.g. Coins)', type: 3, required: true },
            { name: 'description', description: 'Short description', type: 3, required: true },
            { name: 'emoji', description: 'Category emoji (e.g. 🪙)', type: 3, required: true },
          ],
        },
        {
          name: 'list',
          description: 'List all store categories',
          type: 1,
        },
      ],
    },
    // ── Phase 1 + Phase 2 product group ──────────────────────────────────────
    {
      name: 'product',
      description: 'Manage store products',
      type: 2,
      options: [
        {
          name: 'add',
          description: 'Add a new product to a category',
          type: 1,
          options: [
            { name: 'name', description: 'Product name', type: 3, required: true },
            { name: 'category', description: 'Category ID (from /store category list)', type: 3, required: true },
            { name: 'price', description: 'Unit price', type: 10, required: true },
            { name: 'currency', description: 'Currency label (default: coins)', type: 3, required: false },
            { name: 'description', description: 'Product description', type: 3, required: false },
            { name: 'stock', description: 'Stock amount (-1 or omit for unlimited)', type: 4, required: false },
          ],
        },
        {
          name: 'list',
          description: 'List products in a category',
          type: 1,
          options: [
            { name: 'category', description: 'Category ID', type: 3, required: true },
          ],
        },
        {
          name: 'stock',
          description: 'Update stock for a product',
          type: 1,
          options: [
            { name: 'product', description: 'Product ID', type: 3, required: true },
            { name: 'amount', description: 'New stock amount (-1 for unlimited)', type: 4, required: true },
          ],
        },
        {
          name: 'hide',
          description: 'Toggle product visibility (hide or show)',
          type: 1,
          options: [
            { name: 'product', description: 'Product ID', type: 3, required: true },
          ],
        },
        {
          name: 'delete',
          description: 'Delete a product permanently',
          type: 1,
          options: [
            { name: 'product', description: 'Product ID', type: 3, required: true },
          ],
        },
        // Phase 2: variant management
        {
          name: 'variant',
          description: 'Add a variant (e.g. VIP 30/60/90 Days, Weapon +5/+7/+9) to a product',
          type: 1,
          options: [
            { name: 'product', description: 'Product ID', type: 3, required: true },
            { name: 'name', description: 'Variant name (e.g. 30 Days)', type: 3, required: true },
            { name: 'price', description: 'Variant price', type: 10, required: true },
            { name: 'stock', description: 'Stock (-1 for unlimited)', type: 4, required: false },
          ],
        },
      ],
    },
    // ── Phase 2 coupon group ──────────────────────────────────────────────────
    {
      name: 'coupon',
      description: 'Manage discount coupons',
      type: 2,
      options: [
        {
          name: 'add',
          description: 'Create a new coupon code',
          type: 1,
          options: [
            { name: 'code', description: 'Coupon code (e.g. SUMMER20)', type: 3, required: true },
            {
              name: 'type',
              description: 'Discount type',
              type: 3,
              required: true,
              choices: [
                { name: 'Percentage off', value: 'percentage' },
                { name: 'Fixed amount off', value: 'fixed' },
                { name: 'Free item', value: 'free_item' },
              ],
            },
            { name: 'value', description: 'Discount value (% or flat amount)', type: 10, required: true },
            { name: 'max_uses', description: 'Max uses (omit for unlimited)', type: 4, required: false },
            { name: 'expires_days', description: 'Expires in this many days (omit for no expiry)', type: 4, required: false },
          ],
        },
        {
          name: 'list',
          description: 'List all coupons',
          type: 1,
        },
        {
          name: 'delete',
          description: 'Delete a coupon',
          type: 1,
          options: [
            { name: 'coupon', description: 'Coupon ID', type: 3, required: true },
          ],
        },
      ],
    },
    // ── Phase 2 payment group ─────────────────────────────────────────────────
    {
      name: 'payment',
      description: 'Manage payment methods',
      type: 2,
      options: [
        {
          name: 'list',
          description: 'List all payment methods',
          type: 1,
        },
        {
          name: 'toggle',
          description: 'Toggle a payment method active/inactive',
          type: 1,
          options: [
            { name: 'method', description: 'Payment method ID', type: 3, required: true },
          ],
        },
      ],
    },
    // ── Phase 2 offer group ───────────────────────────────────────────────────
    {
      name: 'offer',
      description: 'Manage special offers (flash sales, bundles, featured)',
      type: 2,
      options: [
        {
          name: 'add',
          description: 'Create a special offer',
          type: 1,
          options: [
            {
              name: 'type',
              description: 'Offer type',
              type: 3,
              required: true,
              choices: [
                { name: 'Flash Sale', value: 'flash_sale' },
                { name: 'Bundle', value: 'bundle' },
                { name: 'Featured', value: 'featured' },
              ],
            },
            { name: 'name', description: 'Offer name', type: 3, required: true },
            { name: 'product', description: 'Product ID to include', type: 3, required: true },
            { name: 'discount', description: 'Discount percentage (for flash sales)', type: 10, required: false },
            { name: 'hours', description: 'Duration in hours (omit for permanent)', type: 4, required: false },
          ],
        },
        {
          name: 'list',
          description: 'List all offers',
          type: 1,
        },
        {
          name: 'delete',
          description: 'Delete an offer',
          type: 1,
          options: [
            { name: 'offer', description: 'Offer ID', type: 3, required: true },
          ],
        },
      ],
    },
  ],
};

const PANEL_COMMAND = {
  name: 'panel',
  description: 'Open the Discord Control Center — browse and execute all 323 tools interactively',
};

const CC_TEST_COMMAND = {
  name: 'cc-test',
  description: '[Admin] Run a full Control Center render audit — checks every renderer for duplicate IDs',
};

const ALL_COMMANDS = [
  STORE_COMMAND,
  PANEL_COMMAND,
  CC_TEST_COMMAND,
  AI_COMMAND,
  FORGET_COMMAND,
  MEMORY_COMMAND,
  PREFERENCES_COMMAND,
  RESET_PREFS_COMMAND,
  WORKSPACE_COMMAND,
  VOICE_COMMAND,
  TICKET_COMMAND,
  // Moderation System Pro
  WARN_COMMAND,
  UNWARN_COMMAND,
  WARNINGS_COMMAND,
  CLEARWARNINGS_COMMAND,
  MUTE_COMMAND,
  TEMPTIMEOUT_COMMAND,
  UNMUTE_COMMAND,
  KICK_COMMAND,
  BAN_COMMAND,
  TEMPBAN_COMMAND,
  UNBAN_COMMAND,
  SOFTBAN_COMMAND,
  PURGE_COMMAND,
  SLOWMODE_COMMAND,
  NICK_COMMAND,
  LOCK_COMMAND,
  UNLOCK_COMMAND,
  ROLE_COMMAND,
  CASE_COMMAND,
  HISTORY_COMMAND,
  EDITCASE_COMMAND,
  DELETECASE_COMMAND,
  // Staff Management Pro
  SHIFT_COMMAND,
];

const GUILD_IDS = [
  '1213437502078062674', // Main server
  '1525253442153615443', // Test server
];

export async function registerSlashCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);

  // Clear any previously registered global commands
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    logger.info('Cleared global commands');
  } catch (error) {
    logger.error('Failed to clear global commands', error);
  }

  // Register guild-specifically to each server (instant, isolated)
  for (const guildId of GUILD_IDS) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: ALL_COMMANDS });
      logger.success(`Registered ${ALL_COMMANDS.length} commands in guild ${guildId}`);
    } catch (error) {
      logger.error(`Failed to register commands in guild ${guildId}`, error);
    }
  }
}
