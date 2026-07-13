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
  /** Discord-native inbox: for `staff_reply`, the ID of the message the bot sent in the user's DM
   *  (as opposed to `id`, which for thread-typed replies is the staff member's own thread message
   *  ID). Editing/deleting a reply always targets this DM message, since it's the one the bot — and
   *  therefore the bot itself — actually owns and can mutate. */
  dmMessageId?: string;
  /** Discord-native inbox: message actions (⭐ Pin) toggle this; also mirrored onto the underlying
   *  Discord message via message.pin()/unpin() where the bot has permission to do so. */
  isPinned?: boolean;
  /** Discord-native inbox: set when a staff reply is deleted via the 🗑 message action. The DM
   *  message itself is deleted from Discord; this just keeps the log honest instead of erasing history. */
  isDeleted?: boolean;
}

export type ConversationStatus = 'open' | 'closed';
export type InboxSortMode    = 'newest' | 'oldest' | 'unread';
export type InboxFilterMode  = 'all' | 'unread' | 'pinned' | 'archived';

/** Discord-native inbox: display-only status badge, derived from `status`/`isArchived`/`assignedTo`/
 *  last-message-author rather than stored — keeps `ConversationStatus` (used by the ephemeral /panel
 *  UI too) unchanged so this is purely additive. See `computeBadgeStatus()` in inbox-store.ts. */
export type ConversationBadgeStatus =
  | 'archived'
  | 'closed'
  | 'waiting_for_staff'
  | 'waiting_for_user'
  | 'claimed';

/** Discord-native inbox: one entry in a conversation's auto-generated activity timeline. */
export type TimelineEventType =
  | 'created'
  | 'first_reply'
  | 'assigned'
  | 'voice_session'
  | 'note'
  | 'closed'
  | 'reopened';

export interface TimelineEvent {
  type: TimelineEventType;
  timestamp: number;
  /** Free-form context, e.g. the staff tag for `assigned`/`note` events. */
  detail?: string;
}

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
  /** Discord-native inbox: auto-generated activity timeline (Created, First Reply, Assigned, Voice Session, Notes, Closed, Reopened). */
  timeline: TimelineEvent[];
  /** Discord-native inbox: ID of the pinned "Conversation Header" message in the thread, so it can be edited in place instead of recreated. */
  headerMessageId?: string;
  /** Discord-native inbox: ID of the pinned "AI Sidebar" message in the thread. */
  aiSidebarMessageId?: string;
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
