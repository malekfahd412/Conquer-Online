import { config as loadDotenv } from 'dotenv';

loadDotenv();

export type DataSource = 'mssql' | 'api' | 'mock';

export interface MssqlConfig {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface ApiConfig {
  baseUrl: string;
}

export interface AIModuleConfig {
  adminRole: string;
  logChannelId: string | undefined;
  chatChannelId: string | undefined;
}

export interface AppConfig {
  discord: {
    token: string;
    statusChannelId: string;
  };
  server: {
    name: string;
    logoUrl: string | undefined;
  };
  social: {
    website: string | undefined;
    facebook: string | undefined;
    whatsapp: string | undefined;
    discordInvite: string | undefined;
    instagram: string | undefined;
    youtube: string | undefined;
    tiktok: string | undefined;
  };
  dataSource: DataSource;
  mssql: MssqlConfig | undefined;
  api: ApiConfig | undefined;
  updateIntervalMs: number;
  ai: AIModuleConfig;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    process.stderr.write(`[FATAL] Missing required environment variable: ${key}\n`);
    process.stderr.write(`        Set ${key} in your environment and restart the bot.\n`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim() !== '' ? value : undefined;
}

export function loadConfig(): AppConfig {
  const rawDataSource = process.env['DATA_SOURCE'];
  const validSources: DataSource[] = ['mssql', 'api', 'mock'];
  const dataSource: DataSource =
    rawDataSource && (validSources as string[]).includes(rawDataSource)
      ? (rawDataSource as DataSource)
      : 'mock';

  let mssql: MssqlConfig | undefined;
  let api: ApiConfig | undefined;

  if (dataSource === 'mssql') {
    mssql = {
      server: requireEnv('MSSQL_SERVER'),
      port: parseInt(process.env['MSSQL_PORT'] ?? '1433', 10),
      database: requireEnv('MSSQL_DATABASE'),
      user: requireEnv('MSSQL_USER'),
      password: requireEnv('MSSQL_PASSWORD'),
    };
  }

  if (dataSource === 'api') {
    api = {
      baseUrl: requireEnv('GAME_SERVER_API_URL'),
    };
  }

  return {
    discord: {
      token: requireEnv('DISCORD_BOT_TOKEN'),
      statusChannelId: requireEnv('CHANNEL_SERVER_STATUS'),
    },
    server: {
      name: requireEnv('SERVER_NAME'),
      logoUrl: optionalEnv('SERVER_LOGO_URL'),
    },
    social: {
      website: optionalEnv('SERVER_WEBSITE'),
      facebook: optionalEnv('FACEBOOK_URL'),
      whatsapp: optionalEnv('WHATSAPP_URL'),
      discordInvite: optionalEnv('DISCORD_INVITE'),
      instagram: optionalEnv('INSTAGRAM_URL'),
      youtube: optionalEnv('YOUTUBE_URL'),
      tiktok: optionalEnv('TIKTOK_URL'),
    },
    dataSource,
    mssql,
    api,
    updateIntervalMs: parseInt(process.env['UPDATE_INTERVAL_MS'] ?? '30000', 10),
    ai: {
      adminRole: optionalEnv('ROLE_ADMIN') ?? '',
      logChannelId: optionalEnv('CHANNEL_AI_LOG'),
      chatChannelId: optionalEnv('CHANNEL_AI_CHAT'),
    },
  };
}
