// ─────────────────────────────────────────────────────────────────────────────
// Security Store — JSON persistence for Security Center Pro.
// Stored at data/security.json (top-level data dir, like mod-cases.json).
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs';
import path from 'path';
import type {
  SecurityStoreData,
  SecurityGuildConfig,
  SecurityModuleKey,
  SecurityModuleConfig,
  SecurityEvent,
} from './security-types';
import { ALL_MODULE_KEYS } from './security-types';

const DATA_DIR  = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'security.json');

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_MODULE_CONFIG: SecurityModuleConfig = {
  enabled:      false,
  punishment:   'timeout',
  actionLimit:  5,
  timeWindowMs: 10_000,
  ignoreBots:   true,
  whitelist:    [],
  trustedRoles: [],
  trustedUsers: [],
};

function defaultGuild(guildId: string): SecurityGuildConfig {
  const modules = {} as Record<SecurityModuleKey, SecurityModuleConfig>;
  for (const key of ALL_MODULE_KEYS) modules[key] = { ...DEFAULT_MODULE_CONFIG };
  return { guildId, emergencyMode: false, emergencyLockedChannels: [], bypassRoles: [], modules };
}

function defaultStore(): SecurityStoreData {
  return { guilds: {}, events: [] };
}

// ── In-memory cache + serialized write queue ──────────────────────────────────

let cache: SecurityStoreData | undefined;
let writeQueue: Promise<void> = Promise.resolve();

async function read(): Promise<SecurityStoreData> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    cache = JSON.parse(raw) as SecurityStoreData;
    if (!cache.guilds) cache.guilds = {};
    if (!cache.events) cache.events = [];
  } catch {
    cache = defaultStore();
  }
  return cache;
}

async function persist(data: SecurityStoreData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function mutate<R>(fn: (data: SecurityStoreData) => R | Promise<R>): Promise<R> {
  const run = async (): Promise<R> => {
    const data = await read();
    const result = await fn(data);
    cache = data;
    await persist(data);
    return result;
  };
  const p = writeQueue.then(run, run);
  writeQueue = p.then(() => undefined, () => undefined);
  return p;
}

// ── Ensure module keys are populated ─────────────────────────────────────────

function normalizeGuild(cfg: SecurityGuildConfig): SecurityGuildConfig {
  if (!cfg.bypassRoles) cfg.bypassRoles = [];
  for (const key of ALL_MODULE_KEYS) {
    if (!cfg.modules[key]) cfg.modules[key] = { ...DEFAULT_MODULE_CONFIG };
  }
  return cfg;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getGuildConfig(guildId: string): Promise<SecurityGuildConfig> {
  const data = await read();
  if (!data.guilds[guildId]) data.guilds[guildId] = defaultGuild(guildId);
  return normalizeGuild(data.guilds[guildId]);
}

export async function patchGuildConfig(
  guildId: string,
  patch: Partial<Omit<SecurityGuildConfig, 'guildId' | 'modules'>>,
): Promise<SecurityGuildConfig> {
  return mutate(data => {
    if (!data.guilds[guildId]) data.guilds[guildId] = defaultGuild(guildId);
    Object.assign(data.guilds[guildId], patch);
    return normalizeGuild(data.guilds[guildId]);
  });
}

export async function patchModuleConfig(
  guildId: string,
  module: SecurityModuleKey,
  patch: Partial<SecurityModuleConfig>,
): Promise<SecurityModuleConfig> {
  return mutate(data => {
    if (!data.guilds[guildId]) data.guilds[guildId] = defaultGuild(guildId);
    const cfg = data.guilds[guildId];
    if (!cfg.modules[module]) cfg.modules[module] = { ...DEFAULT_MODULE_CONFIG };
    Object.assign(cfg.modules[module], patch);
    return cfg.modules[module];
  });
}

export async function toggleModule(guildId: string, module: SecurityModuleKey): Promise<boolean> {
  return mutate(data => {
    if (!data.guilds[guildId]) data.guilds[guildId] = defaultGuild(guildId);
    const m = data.guilds[guildId].modules[module] ?? { ...DEFAULT_MODULE_CONFIG };
    data.guilds[guildId].modules[module] = m;
    m.enabled = !m.enabled;
    return m.enabled;
  });
}

export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  await mutate(data => {
    data.events.unshift(event);
    if (data.events.length > 1000) data.events = data.events.slice(0, 1000);
  });
}

export async function getSecurityEvents(guildId: string, limit = 50): Promise<SecurityEvent[]> {
  const data = await read();
  return data.events.filter(e => e.guildId === guildId).slice(0, limit);
}
