import { promises as fs } from 'fs';
import path from 'path';

export interface WelcomeButton {
  label: string;
  url: string;
  emoji?: string;
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

const defaultWelcome = (guildId: string): WelcomeConfig => ({
  guildId, enabled: false, messages: ['Welcome {user} to {server}! We now have {membercount} members.'],
  embedColor: 0x57f287, buttons: [], autoRoleIds: [], dmEnabled: false, delaySeconds: 0,
});

const defaultGoodbye = (guildId: string): GoodbyeConfig => ({
  guildId, enabled: false, messages: ['{username} has left {server}. We now have {membercount} members.'],
  embedColor: 0xed4245, dmEnabled: false,
});

export async function getWelcomeConfig(guildId: string): Promise<WelcomeConfig> {
  const data = await load();
  return data.welcome.find(w => w.guildId === guildId) ?? defaultWelcome(guildId);
}

export async function setWelcomeConfig(guildId: string, patch: Partial<WelcomeConfig>): Promise<WelcomeConfig> {
  const data = await load();
  let cfg = data.welcome.find(w => w.guildId === guildId);
  if (!cfg) { cfg = defaultWelcome(guildId); data.welcome.push(cfg); }
  Object.assign(cfg, patch);
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
