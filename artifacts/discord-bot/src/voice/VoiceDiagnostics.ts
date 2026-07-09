import { WhisperSTT } from './providers/stt/whisper.stt';
import { DeepgramSTT } from './providers/stt/deepgram.stt';
import { AssemblyAISTT } from './providers/stt/assemblyai.stt';
import { GoogleSpeechSTT } from './providers/stt/google-speech.stt';
import { OpenAITTS } from './providers/tts/openai.tts';
import { ElevenLabsTTS } from './providers/tts/elevenlabs.tts';
import { AzureTTS } from './providers/tts/azure.tts';
import { GoogleCloudTTS } from './providers/tts/google-cloud.tts';
import { logger } from '../utils/logger';

interface DiagnosticCheck {
  label: string;
  status: '✓' | '⚠' | '❌';
  note: string;
}

interface ProviderCheck {
  name: string;
  configured: boolean;
  envVars: string[];
}

const STT_PROVIDERS: ProviderCheck[] = [
  { name: 'OpenAI Whisper', configured: WhisperSTT.isConfigured(), envVars: ['OPENAI_API_KEY'] },
  { name: 'Deepgram',       configured: DeepgramSTT.isConfigured(), envVars: ['DEEPGRAM_API_KEY'] },
  { name: 'AssemblyAI',     configured: AssemblyAISTT.isConfigured(), envVars: ['ASSEMBLYAI_API_KEY'] },
  { name: 'Google Speech',  configured: GoogleSpeechSTT.isConfigured(), envVars: ['GOOGLE_API_KEY'] },
];

const TTS_PROVIDERS: ProviderCheck[] = [
  { name: 'OpenAI TTS',       configured: OpenAITTS.isConfigured(),       envVars: ['OPENAI_API_KEY'] },
  { name: 'ElevenLabs',       configured: ElevenLabsTTS.isConfigured(),   envVars: ['ELEVENLABS_API_KEY'] },
  { name: 'Azure TTS',        configured: AzureTTS.isConfigured(),        envVars: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'] },
  { name: 'Google Cloud TTS', configured: GoogleCloudTTS.isConfigured(), envVars: ['GOOGLE_API_KEY'] },
];

export class VoiceDiagnostics {
  static run(sttProvider: string, ttsProvider: string): void {
    logger.info('────────────────────────────────────────');
    logger.info('  Voice AI Startup Diagnostics');
    logger.info('────────────────────────────────────────');

    const checks: DiagnosticCheck[] = [
      ...this.checkEnv('GEMINI_API_KEY',     'Gemini API Key (AI provider)'),
      ...this.checkEnv('DISCORD_BOT_TOKEN',  'Discord Bot Token'),
    ];

    // STT
    const selectedSTT = STT_PROVIDERS.find(p => p.name.toLowerCase().includes(sttProvider.toLowerCase()));
    if (selectedSTT) {
      checks.push({
        label: `STT: ${selectedSTT.name}`,
        status: selectedSTT.configured ? '✓' : '❌',
        note: selectedSTT.configured
          ? 'Configured'
          : `Missing: ${selectedSTT.envVars.join(', ')}`,
      });
    } else {
      checks.push({ label: `STT Provider: "${sttProvider}"`, status: '⚠', note: 'Unknown provider — defaulting to Whisper' });
    }

    // TTS
    const selectedTTS = TTS_PROVIDERS.find(p => p.name.toLowerCase().includes(ttsProvider.toLowerCase()));
    if (selectedTTS) {
      checks.push({
        label: `TTS: ${selectedTTS.name}`,
        status: selectedTTS.configured ? '✓' : '❌',
        note: selectedTTS.configured
          ? 'Configured'
          : `Missing: ${selectedTTS.envVars.join(', ')}`,
      });
    } else {
      checks.push({ label: `TTS Provider: "${ttsProvider}"`, status: '⚠', note: 'Unknown provider — defaulting to OpenAI TTS' });
    }

    // Voice language & name
    checks.push(
      ...this.checkEnv('VOICE_LANGUAGE', 'Voice language', false, 'en'),
      ...this.checkEnv('VOICE_NAME',     'Voice name',     false),
    );

    // Optional provider configs
    checks.push({
      label: 'All STT providers',
      status: STT_PROVIDERS.some(p => p.configured) ? '✓' : '⚠',
      note: STT_PROVIDERS.filter(p => p.configured).map(p => p.name).join(', ') || 'None configured',
    });

    checks.push({
      label: 'All TTS providers',
      status: TTS_PROVIDERS.some(p => p.configured) ? '✓' : '⚠',
      note: TTS_PROVIDERS.filter(p => p.configured).map(p => p.name).join(', ') || 'None configured',
    });

    // Print results
    for (const check of checks) {
      const line = `  ${check.status} ${check.label.padEnd(30)} ${check.note}`;
      if (check.status === '✓') logger.success(line);
      else if (check.status === '⚠') logger.warning(line);
      else logger.error(line, undefined);
    }

    const errors = checks.filter(c => c.status === '❌');
    if (errors.length > 0) {
      logger.warning('');
      logger.warning('  Some voice providers are not configured.');
      logger.warning('  Voice features will still work with the configured providers.');
      logger.warning('  Add the missing secrets to enable additional providers.');
    }

    logger.info('────────────────────────────────────────');
  }

  private static checkEnv(
    key: string,
    label: string,
    required = false,
    defaultValue?: string,
  ): DiagnosticCheck[] {
    const value = process.env[key];
    if (value && value.trim() !== '') {
      return [{ label, status: '✓', note: 'Set' }];
    }
    if (defaultValue !== undefined) {
      return [{ label, status: '⚠', note: `Not set — using default: "${defaultValue}"` }];
    }
    return [{ label, status: required ? '❌' : '⚠', note: `${key} not set` }];
  }
}
