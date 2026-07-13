// ─────────────────────────────────────────────────────────────────────────────
// CompanionService — friendly AI chat companion, completely isolated from the
// admin AI (no tools, no planning, no moderation). Users talk to it by mention,
// reply, /chat command, or in a dedicated companion channel.
// ─────────────────────────────────────────────────────────────────────────────
import { companionStore, CompanionProfile, FRIENDSHIP_LABELS, FRIENDSHIP_EMOJIS } from './companion-store';
import { logger } from '../utils/logger';

export interface CompanionConfig {
  /**
   * Raw AI call — passes messages to whatever provider is configured and returns
   * the assistant's text reply. The companion injects its own system prompt.
   */
  callAI: (messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>) => Promise<string>;
  /** Optional dedicated channel ID where ALL messages trigger companion mode. */
  channelId?: string;
  /** Display name of the server, used in the system prompt. */
  serverName: string;
}

// ── Memory extraction helpers ─────────────────────────────────────────────────

const NICKNAME_PATTERNS = [
  /call me ([\w\s]+)/i,
  /my name is ([\w\s]+)/i,
  /i go by ([\w\s]+)/i,
  /i'm ([\w]+),?\s+(?:but you can|call me|just call)/i,
];

const REMEMBER_PATTERNS = [
  /remember (?:that )?(.+)/i,
  /don't forget (?:that )?(.+)/i,
  /keep in mind (?:that )?(.+)/i,
  /note (?:that )?(.+)/i,
];

const GAME_KEYWORDS = [
  'minecraft', 'fortnite', 'valorant', 'league of legends', 'lol', 'cs2', 'csgo', 'apex',
  'roblox', 'gta', 'cod', 'call of duty', 'overwatch', 'dota', 'pubg', 'among us',
  'conquer', 'conquer online', 'wow', 'world of warcraft', 'ff14', 'final fantasy',
  'zelda', 'pokemon', 'minecraft', 'terraria', 'rust', 'ark', 'destiny',
];

const INTEREST_KEYWORDS: Record<string, string[]> = {
  gaming:       ['game', 'gaming', 'play', 'gamer'],
  programming:  ['code', 'coding', 'programming', 'developer', 'python', 'javascript', 'typescript'],
  music:        ['music', 'song', 'listen', 'artist', 'rap', 'band', 'spotify'],
  movies:       ['movie', 'film', 'cinema', 'watch', 'series', 'netflix', 'anime'],
  school:       ['school', 'study', 'exam', 'college', 'university', 'homework'],
  sports:       ['football', 'soccer', 'basketball', 'sport', 'gym', 'workout'],
  technology:   ['tech', 'technology', 'phone', 'computer', 'laptop', 'gpu', 'pc'],
  art:          ['art', 'draw', 'design', 'creative', 'paint', 'sketch'],
};

function extractMemoryFacts(message: string): {
  nickname?: string;
  interests: string[];
  favoriteGames: string[];
  memorandums: string[];
} {
  const lower = message.toLowerCase();
  const facts: ReturnType<typeof extractMemoryFacts> = { interests: [], favoriteGames: [], memorandums: [] };

  // Nickname
  for (const pattern of NICKNAME_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) { facts.nickname = match[1].trim().split(' ')[0]; break; }
  }

  // Remember phrases
  for (const pattern of REMEMBER_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) { facts.memorandums.push(match[1].trim().slice(0, 200)); }
  }

  // Games
  for (const game of GAME_KEYWORDS) {
    if (lower.includes(game)) facts.favoriteGames.push(game);
  }

  // Interests
  for (const [interest, keywords] of Object.entries(INTEREST_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) facts.interests.push(interest);
  }

  return facts;
}

// ── System Prompt Builder ─────────────────────────────────────────────────────

function buildSystemPrompt(profile: CompanionProfile, serverName: string): string {
  const friendLabel = FRIENDSHIP_LABELS[profile.friendshipLevel];
  const isNewUser = profile.conversationCount === 0;

  const memoriesSection = [
    profile.nickname ? `• User's preferred name: ${profile.nickname}` : null,
    profile.interests.length ? `• Known interests: ${profile.interests.join(', ')}` : null,
    profile.favoriteGames.length ? `• Favorite games: ${profile.favoriteGames.join(', ')}` : null,
    ...profile.memorandums.map(m => `• Remember: ${m}`),
  ].filter(Boolean);

  return `You are Mufasa, the friendly companion bot for the "${serverName}" gaming community Discord server.

Your personality:
- Warm, funny, and genuinely friendly — like talking to a real friend
- Use emojis naturally (not forced, not every sentence)
- Adapt your language and tone to match the user automatically:
  • If they write in Egyptian Arabic (عربي), reply in Egyptian Arabic
  • If they write casually, be casual; if formally, be formal
  • Match their humor level, their seriousness, their energy
- Ask natural follow-up questions when interested
- Occasionally reference previous things they told you (feels natural, not robotic)
- You can joke, you can be playful, you can be serious — read the room
- You're a gamer and tech enthusiast at heart
- Never break Discord rules or encourage harmful behavior
- NEVER pretend to perform real-world actions (you can't ban people, you can't send DMs to others, etc.)
- NEVER fabricate memories — only reference what users have actually shared

Your relationship with this user: **${friendLabel}** ${FRIENDSHIP_EMOJIS[profile.friendshipLevel]}
${isNewUser ? '(This is your first time talking with them — be welcoming but natural)' : `(You\'ve had ${profile.conversationCount} conversations with them)`}

${memoriesSection.length > 0 ? `What you know about this user:\n${memoriesSection.join('\n')}` : 'You don\'t know much about this user yet — learn as you go.'}

Important rules:
- You are ONLY a companion chat bot — you cannot manage the server, tickets, or moderation
- Keep responses conversational — usually 1-3 sentences unless they asked something that needs more
- Don't always start with the user's name — that gets repetitive
- Vary your openers and style naturally
- If unsure of their language, default to English`;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CompanionService {
  constructor(private readonly config: CompanionConfig) {}

  /** Main entry point: takes a raw user message and returns the companion's reply. */
  async chat(userId: string, guildId: string, userMessage: string): Promise<string> {
    try {
      const profile = await companionStore.getProfile(userId, guildId);

      // Build conversation context (last 20 messages = 10 turns)
      const history = profile.history.slice(-20).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: buildSystemPrompt(profile, this.config.serverName) },
        ...history,
        { role: 'user', content: userMessage },
      ];

      const reply = await this.config.callAI(messages);
      const cleanReply = reply.trim();

      // Extract and save memory facts from user message
      const facts = extractMemoryFacts(userMessage);
      const hasNewFacts = facts.nickname || facts.interests.length || facts.favoriteGames.length || facts.memorandums.length;

      // Persist in parallel
      await Promise.all([
        companionStore.addMessage(userId, guildId, 'user', userMessage),
        companionStore.addMessage(userId, guildId, 'assistant', cleanReply),
        companionStore.recordConversation(userId, guildId),
        hasNewFacts ? companionStore.updateMemory(userId, guildId, facts) : Promise.resolve(),
      ]);

      return cleanReply;
    } catch (err) {
      logger.error('[COMPANION] Chat error', err);
      return "Sorry, I got a bit confused there 😅 Give me a sec and try again!";
    }
  }

  /** Clear conversation history. Keeps profile metadata (interests, friendship, etc.). */
  async reset(userId: string, guildId: string): Promise<void> {
    await companionStore.resetHistory(userId, guildId);
  }

  /** Get the current profile for display to the user. */
  async getProfile(userId: string, guildId: string): Promise<CompanionProfile> {
    return companionStore.getProfile(userId, guildId);
  }

  /** True if the given channel is the configured companion-only channel. */
  isCompanionChannel(channelId: string): boolean {
    return !!this.config.channelId && this.config.channelId === channelId;
  }

  async ensureStore(): Promise<void> {
    await companionStore.ensureDir();
  }
}
