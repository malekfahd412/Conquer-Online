import { promises as fs } from 'fs';
import path from 'path';

export interface WelcomeButton {
  label: string;
  url: string;
  emoji?: string;
}

/**
 * ProBot-style dynamic welcome card configuration. All coordinates are pixel
 * positions on the generated canvas — never hardcoded in the renderer, always
 * read from here. Presence of `backgroundImage` is what turns the card on:
 * when unset, welcome.service.ts falls back to the original embed
 * image/thumbnail behaviour untouched.
 */
export interface WelcomeCardConfig {
  /** Local path (e.g. data/welcome-backgrounds/<guildId>.png) or a URL. Unset = card disabled. */
  backgroundImage?: string;
  avatarX: number;
  avatarY: number;
  avatarSize: number;
  avatarBorderEnabled: boolean;
  avatarBorderColor: string;
  avatarBorderWidth: number;
  usernameX: number;
  usernameY: number;
  serverNameX: number;
  serverNameY: number;
  memberCountX: number;
  memberCountY: number;
  textColor: string;
  fontSize: number;
  fontFamily: string;
}

export interface WelcomeConfig {
  guildId: string;
  enabled: boolean;
  channelId?: string;
  messages: string[];
  embedTitle?: string;
  embedColor: number;
  image?: string;
  buttons: WelcomeButton[];
  autoRoleIds: string[];
  autoNickname?: string;
  dmEnabled: boolean;
  dmMessage?: string;
  delaySeconds: number;
  card: WelcomeCardConfig;
}

export interface GoodbyeConfig {
  guildId: string;
  enabled: boolean;
  channelId?: string;
  messages: string[];
  embedTitle?: string;
  embedColor: number;
  image?: string;
  dmEnabled: boolean;
  dmMessage?: string;
}

interface WelcomeData {
  welcome: WelcomeConfig[];
  goodbye: GoodbyeConfig[];
}

const DATA_PATH = path.join(process.cwd(), 'data', 'welcome.json');

async function load(): Promise<WelcomeData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as WelcomeData;
  } catch {
    return { welcome: [], goodbye: [] };
  }
}

async function save(data: WelcomeData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export const DEFAULT_CARD: WelcomeCardConfig = {
  backgroundImage: undefined,
  avatarX: 40, avatarY: 86, avatarSize: 128,
  avatarBorderEnabled: true, avatarBorderColor: '#FFFFFF', avatarBorderWidth: 6,
  usernameX: 195, usernameY: 118,
  serverNameX: 195, serverNameY: 160,
  memberCountX: 195, memberCountY: 196,
  textColor: '#FFFFFF', fontSize: 30, fontFamily: 'Poppins',
};

const defaultWelcome = (guildId: string): WelcomeConfig => ({
  guildId, enabled: false, messages: ['Welcome {user} to {server}! We now have {membercount} members.'],
  embedColor: 0x57f287, buttons: [], autoRoleIds: [], dmEnabled: false, delaySeconds: 0,
  card: { ...DEFAULT_CARD },
});

/** Backfills `card` (and any of its fields) for configs persisted before the welcome-card feature existed. */
function normalizeWelcome(cfg: WelcomeConfig): WelcomeConfig {
  cfg.card = { ...DEFAULT_CARD, ...(cfg.card ?? {}) };
  return cfg;
}

const defaultGoodbye = (guildId: string): GoodbyeConfig => ({
  guildId, enabled: false, messages: ['{username} has left {server}. We now have {membercount} members.'],
  embedColor: 0xed4245, dmEnabled: false,
});

export async function getWelcomeConfig(guildId: string): Promise<WelcomeConfig> {
  const data = await load();
  const cfg = data.welcome.find(w => w.guildId === guildId) ?? defaultWelcome(guildId);
  return normalizeWelcome(cfg);
}

export async function setWelcomeConfig(guildId: string, patch: Partial<WelcomeConfig>): Promise<WelcomeConfig> {
  const data = await load();
  let cfg = data.welcome.find(w => w.guildId === guildId);
  if (!cfg) { cfg = defaultWelcome(guildId); data.welcome.push(cfg); }
  normalizeWelcome(cfg);
  Object.assign(cfg, patch);
  await save(data);
  return cfg;
}

/** Patches only the welcome-card sub-config, deep-merging so unrelated fields survive. */
export async function setWelcomeCardConfig(guildId: string, patch: Partial<WelcomeCardConfig>): Promise<WelcomeConfig> {
  const data = await load();
  let cfg = data.welcome.find(w => w.guildId === guildId);
  if (!cfg) { cfg = defaultWelcome(guildId); data.welcome.push(cfg); }
  normalizeWelcome(cfg);
  cfg.card = { ...cfg.card, ...patch };
  await save(data);
  return cfg;
}

export async function getGoodbyeConfig(guildId: string): Promise<GoodbyeConfig> {
  const data = await load();
  return data.goodbye.find(g => g.guildId === guildId) ?? defaultGoodbye(guildId);
}

export async function setGoodbyeConfig(guildId: string, patch: Partial<GoodbyeConfig>): Promise<GoodbyeConfig> {
  const data = await load();
  let cfg = data.goodbye.find(g => g.guildId === guildId);
  if (!cfg) { cfg = defaultGoodbye(guildId); data.goodbye.push(cfg); }
  Object.assign(cfg, patch);
  await save(data);
  return cfg;
}
