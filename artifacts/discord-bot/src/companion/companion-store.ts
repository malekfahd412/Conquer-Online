// ─────────────────────────────────────────────────────────────────────────────
// Companion Store — persistent per-user profiles for Companion Mode.
// Completely isolated from all ticket / admin / moderation storage.
// Owns data/companion/profiles.json exclusively.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs';
import path from 'path';

const COMPANION_DATA_DIR = path.join(process.cwd(), 'data', 'companion');
const PROFILES_FILE = path.join(COMPANION_DATA_DIR, 'profiles.json');

// ── Types ─────────────────────────────────────────────────────────────────────

export type FriendshipLevel = 0 | 1 | 2 | 3;

export const FRIENDSHIP_LABELS: Record<FriendshipLevel, string> = {
  0: 'Stranger',
  1: 'Regular',
  2: 'Friend',
  3: 'Best Friend',
};

export const FRIENDSHIP_EMOJIS: Record<FriendshipLevel, string> = {
  0: '👤',
  1: '😊',
  2: '🤝',
  3: '💙',
};

/** conversationCount thresholds — reach this count to advance to the corresponding level. */
const FRIENDSHIP_THRESHOLDS: [number, number, number, number] = [0, 8, 25, 60];

export interface CompanionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface CompanionProfile {
  userId: string;
  guildId: string;
  /** Name the user asked to be called. */
  nickname?: string;
  /** Topics the user has mentioned caring about. */
  interests: string[];
  /** Games explicitly mentioned or discussed. */
  favoriteGames: string[];
  /** Free-form facts the user explicitly asked to be remembered. */
  memorandums: string[];
  friendshipLevel: FriendshipLevel;
  conversationCount: number;
  lastSeenAt: number;
  /** Last 40 messages (20 turns). Older messages are pruned. */
  history: CompanionMessage[];
}

interface ProfileData {
  profiles: CompanionProfile[];
}

// ── Store ─────────────────────────────────────────────────────────────────────

class CompanionStore {
  private cache: ProfileData | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  async ensureDir(): Promise<void> {
    await fs.mkdir(COMPANION_DATA_DIR, { recursive: true });
    try {
      await fs.access(PROFILES_FILE);
    } catch {
      await this.write({ profiles: [] });
    }
  }

  private async read(): Promise<ProfileData> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(PROFILES_FILE, 'utf-8');
      this.cache = JSON.parse(raw) as ProfileData;
    } catch {
      this.cache = { profiles: [] };
    }
    return this.cache;
  }

  private async write(data: ProfileData): Promise<void> {
    this.cache = data;
    await fs.mkdir(COMPANION_DATA_DIR, { recursive: true });
    await fs.writeFile(PROFILES_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async mutate<R>(fn: (data: ProfileData) => R): Promise<R> {
    const run = async (): Promise<R> => {
      const data = await this.read();
      const result = fn(data);
      await this.write(data);
      return result;
    };
    const p = this.writeQueue.then(run, run);
    this.writeQueue = p.then(() => undefined, () => undefined);
    return p;
  }

  private profileKey(userId: string, guildId: string): string {
    return `${userId}:${guildId}`;
  }

  async getProfile(userId: string, guildId: string): Promise<CompanionProfile> {
    const data = await this.read();
    return (
      data.profiles.find(p => p.userId === userId && p.guildId === guildId) ??
      this.defaultProfile(userId, guildId)
    );
  }

  private defaultProfile(userId: string, guildId: string): CompanionProfile {
    return {
      userId,
      guildId,
      interests: [],
      favoriteGames: [],
      memorandums: [],
      friendshipLevel: 0,
      conversationCount: 0,
      lastSeenAt: Date.now(),
      history: [],
    };
  }

  async saveProfile(profile: CompanionProfile): Promise<void> {
    await this.mutate(data => {
      const idx = data.profiles.findIndex(p => p.userId === profile.userId && p.guildId === profile.guildId);
      if (idx >= 0) data.profiles[idx] = profile;
      else data.profiles.push(profile);
    });
  }

  /** Append a message to the user's history (capped at 40 entries). */
  async addMessage(userId: string, guildId: string, role: 'user' | 'assistant', content: string): Promise<CompanionProfile> {
    return this.mutate(data => {
      let profile = data.profiles.find(p => p.userId === userId && p.guildId === guildId);
      if (!profile) { profile = this.defaultProfile(userId, guildId); data.profiles.push(profile); }
      profile.history.push({ role, content, timestamp: Date.now() });
      if (profile.history.length > 40) profile.history = profile.history.slice(-40);
      return { ...profile };
    });
  }

  /** Increment conversation count and advance friendship level if thresholds are crossed. */
  async recordConversation(userId: string, guildId: string): Promise<CompanionProfile> {
    return this.mutate(data => {
      let profile = data.profiles.find(p => p.userId === userId && p.guildId === guildId);
      if (!profile) { profile = this.defaultProfile(userId, guildId); data.profiles.push(profile); }
      profile.conversationCount += 1;
      profile.lastSeenAt = Date.now();
      profile.friendshipLevel = computeFriendshipLevel(profile.conversationCount);
      return { ...profile };
    });
  }

  /** Merge memory facts into the profile without overwriting everything else. */
  async updateMemory(
    userId: string,
    guildId: string,
    facts: { nickname?: string; interests?: string[]; favoriteGames?: string[]; memorandums?: string[] },
  ): Promise<void> {
    await this.mutate(data => {
      let profile = data.profiles.find(p => p.userId === userId && p.guildId === guildId);
      if (!profile) { profile = this.defaultProfile(userId, guildId); data.profiles.push(profile); }
      if (facts.nickname) profile.nickname = facts.nickname;
      if (facts.interests?.length) {
        const merged = new Set([...profile.interests, ...facts.interests]);
        profile.interests = Array.from(merged).slice(0, 20);
      }
      if (facts.favoriteGames?.length) {
        const merged = new Set([...profile.favoriteGames, ...facts.favoriteGames]);
        profile.favoriteGames = Array.from(merged).slice(0, 20);
      }
      if (facts.memorandums?.length) {
        profile.memorandums = [...profile.memorandums, ...facts.memorandums].slice(-30);
      }
    });
  }

  /** Wipe conversation history (keep profile metadata). */
  async resetHistory(userId: string, guildId: string): Promise<void> {
    await this.mutate(data => {
      const profile = data.profiles.find(p => p.userId === userId && p.guildId === guildId);
      if (profile) profile.history = [];
    });
  }

  /** Completely remove a profile. */
  async deleteProfile(userId: string, guildId: string): Promise<void> {
    await this.mutate(data => {
      data.profiles = data.profiles.filter(p => !(p.userId === userId && p.guildId === guildId));
    });
  }
}

function computeFriendshipLevel(conversationCount: number): FriendshipLevel {
  if (conversationCount >= FRIENDSHIP_THRESHOLDS[3]) return 3;
  if (conversationCount >= FRIENDSHIP_THRESHOLDS[2]) return 2;
  if (conversationCount >= FRIENDSHIP_THRESHOLDS[1]) return 1;
  return 0;
}

export const companionStore = new CompanionStore();
