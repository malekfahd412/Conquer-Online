// ─────────────────────────────────────────────────────────────────────────────
// Support Inbox Pro — Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface InboxAttachment {
  name: string;
  url: string;
  size?: number;
  contentType?: string;
}

/** A lightweight snapshot of a Discord embed, captured so it can be redisplayed to staff later. */
export interface InboxEmbedSnapshot {
  title?: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  color?: number;
  authorName?: string;
  footerText?: string;
}

export type InboxMessageType =
  | 'user'          // DM from user
  | 'staff_reply'   // Reply sent by staff (bot)
  | 'staff_note';   // Private internal note (never sent to user)

export interface InboxMessage {
  id: string;
  type: InboxMessageType;
  content: string;
  authorId: string;
  authorTag: string;
  timestamp: number;
  isEdited: boolean;
  attachments: InboxAttachment[];
  hasEmbeds: boolean;
  hasStickers: boolean;
  /** Discord message ID of the message being replied to */
  replyToId?: string;
  /** Excerpt of the replied-to message content */
  replyToContent?: string;
  /** Simplified snapshots of any embeds attached to the original Discord message */
  embedSnapshots?: InboxEmbedSnapshot[];
}

export type ConversationStatus = 'open' | 'closed';
export type InboxSortMode    = 'newest' | 'oldest' | 'unread';
export type InboxFilterMode  = 'all' | 'unread' | 'pinned' | 'archived';

export interface InboxConversation {
  /** Unique ID — same as userId (one conversation per user) */
  id: string;
  userId: string;
  userTag: string;
  userAvatar?: string;
  guildId: string;
  messages: InboxMessage[];
  status: ConversationStatus;
  isRead: boolean;
  isPinned: boolean;
  isArchived: boolean;
  /** Staff member the conversation is assigned to */
  assignedTo?: string;
  assignedToTag?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  /** How many unread user messages since last staff read */
  unreadCount: number;
  /** Timestamp of the last time a staff member opened/read this conversation */
  lastSeenAt?: number;
  /** Discord-native inbox: ID of the private thread mirroring this conversation, if one has been created */
  threadId?: string;
  /** Discord-native inbox: ID of the guild the thread lives in (same as guildId in practice, kept for clarity) */
  threadGuildId?: string;
}

export interface InboxData {
  conversations: InboxConversation[];
}

// ── Quick Replies ────────────────────────────────────────────────────────────

export interface QuickReply {
  id: string;
  title: string;
  /** May contain {user}, {server}, {ticket}, {staff} placeholders */
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface QuickReplyData {
  replies: QuickReply[];
}
