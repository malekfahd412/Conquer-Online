import { promises as fs } from 'fs';
import path from 'path';

export interface ServerLogConfig {
  guildId: string;
  logChannelId?: string;
  logMessageDelete: boolean;
  logMessageEdit: boolean;
  logMemberJoin: boolean;
  logMemberLeave: boolean;
  logVoiceJoinLeave: boolean;
}

interface LogData {
  configs: ServerLogConfig[];
}

const DATA_PATH = path.join(process.cwd(), 'data', 'server-logs.json');

async function load(): Promise<LogData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8');
    return JSON.parse(raw) as LogData;
  } catch {
    return { configs: [] };
  }
}

async function save(data: LogData): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

const defaultConfig = (guildId: string): ServerLogConfig => ({
  guildId, logMessageDelete: false, logMessageEdit: false, logMemberJoin: false, logMemberLeave: false, logVoiceJoinLeave: false,
});

export async function getLogConfig(guildId: string): Promise<ServerLogConfig> {
  const data = await load();
  return data.configs.find(c => c.guildId === guildId) ?? defaultConfig(guildId);
}

export async function setLogConfig(guildId: string, patch: Partial<ServerLogConfig>): Promise<ServerLogConfig> {
  const data = await load();
  let cfg = data.configs.find(c => c.guildId === guildId);
  if (!cfg) { cfg = defaultConfig(guildId); data.configs.push(cfg); }
  Object.assign(cfg, patch);
  await save(data);
  return cfg;
}
