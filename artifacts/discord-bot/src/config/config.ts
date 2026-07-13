import { config as loadDotenv } from 'dotenv';

loadDotenv();

export type DataSource = 'mssql' | 'api' | 'mock';
export type AIProviderName = 'gemini' | 'openai' | 'openrouter' | 'groq';
export type STTProviderName = 'whisper' | 'deepgram' | 'assemblyai' | 'google';
export type TTSProviderName = 'openai' | 'elevenlabs' | 'azure' | 'google';
export type VoicePersonality = 'friendly' | 'professional' | 'gaming' | 'funny' | 'assistant';

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
  provider: AIProviderName;
  adminRole: string;
  logChannelId: string | undefined;
  chatChannelId: string | undefined;
  enablePlanPreview: boolean;
  enableReflection: boolean;
  enableObserver: boolean;
  /** Role ID whose members can access Support Inbox (in addition to the admin role). */
  supportStaffRoleId: string | undefined;
  /** Optional override: channel ID to use as the Discord-native Support Inbox dashboard channel. If unset, the bot auto-creates one and remembers it. */
  supportInboxChannelId: string | undefined;
}

export interface VoiceModuleConfig {
  sttProvider: STTProviderName;
  ttsProvider: TTSProviderName;
  personality: VoicePersonality;
  confirmChannelId: string | undefined;
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
  voice: VoiceModuleConfig;
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

function parseBoolean(key: string, defaultValue: boolean): boolean {
  const val = process.env[key]?.toLowerCase();
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return defaultValue;
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
    api = { baseUrl: requireEnv('GAME_SERVER_API_URL') };
  }

  const rawProvider = (process.env['AI_PROVIDER'] ?? 'gemini').toLowerCase().trim();
  const validProviders: AIProviderName[] = ['gemini', 'openai', 'openrouter', 'groq'];
  const aiProvider: AIProviderName = validProviders.includes(rawProvider as AIProviderName)
    ? (rawProvider as AIProviderName)
    : 'gemini';

  const rawSTT = (process.env['STT_PROVIDER'] ?? 'whisper').toLowerCase().trim();
  const validSTT: STTProviderName[] = ['whisper', 'deepgram', 'assemblyai', 'google'];
  const sttProvider: STTProviderName = (validSTT as string[]).includes(rawSTT) ? (rawSTT as STTProviderName) : 'whisper';

  const rawTTS = (process.env['TTS_PROVIDER'] ?? 'openai').toLowerCase().trim();
  const validTTS: TTSProviderName[] = ['openai', 'elevenlabs', 'azure', 'google'];
  const ttsProvider: TTSProviderName = (validTTS as string[]).includes(rawTTS) ? (rawTTS as TTSProviderName) : 'openai';

  const rawPersonality = (process.env['VOICE_PERSONALITY'] ?? 'assistant').toLowerCase().trim();
  const validPersonalities: VoicePersonality[] = ['friendly', 'professional', 'gaming', 'funny', 'assistant'];
  const personality: VoicePersonality = (validPersonalities as string[]).includes(rawPersonality)
    ? (rawPersonality as VoicePersonality)
    : 'assistant';

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
    updateIntervalMs: Math.max(3000, parseInt(process.env['UPDATE_INTERVAL_MS'] ?? '3000', 10) || 3000),
    ai: {
      provider: aiProvider,
      adminRole: optionalEnv('ROLE_ADMIN') ?? '',
      logChannelId: optionalEnv('CHANNEL_AI_LOG'),
      chatChannelId: optionalEnv('CHANNEL_AI_CHAT'),
      enablePlanPreview: parseBoolean('AI_PLAN_PREVIEW', true),
      enableReflection: parseBoolean('AI_REFLECTION', false),
      enableObserver: parseBoolean('AI_OBSERVER', true),
      supportStaffRoleId: optionalEnv('SUPPORT_STAFF_ROLE_ID'),
      supportInboxChannelId: optionalEnv('CHANNEL_SUPPORT_INBOX'),
    },
    voice: {
      sttProvider,
      ttsProvider,
      personality,
      confirmChannelId: optionalEnv('CHANNEL_AI_LOG'), // reuse the AI log channel for voice confirmations
    },
  };
}
