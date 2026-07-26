export interface TalktomeBridgeRuntimeEnvironment {
  enabled: boolean;
  baseUrl: string;
  bridgeId: string;
  token: string;
  mediaAnnounceIp: string;
  configPath: string;
  bridgeName: string;
  authMode: string;
  autoProvisionEndpoints: boolean;
  commandTimeoutMs: number;
  defaultAudioSource: string;
  defaultAudioPlayer: string;
  accountsConfigPath: string;
}

const DEFAULT_CONFIG_PATH = '/config/talktome-bridge.json';
const DEFAULT_ACCOUNTS_PATH = '/config/accounts';

/**
 * TALKTOME_* values must be read by Nitro at request/startup time. Keeping
 * this in a server-only module prevents secrets from entering Nuxt's
 * build-time runtime config or client payload.
 */
export function readTalktomeBridgeEnvironment(): TalktomeBridgeRuntimeEnvironment {
  const enabled = process.env.TALKTOME_BRIDGE_ENABLED === 'true';
  return {
    enabled,
    baseUrl: value('TALKTOME_BASE_URL'),
    bridgeId: value('TALKTOME_BRIDGE_ID'),
    token: value('TALKTOME_BRIDGE_TOKEN'),
    mediaAnnounceIp: value('TALKTOME_MEDIA_ANNOUNCE_IP'),
    configPath: value('TALKTOME_BRIDGE_CONFIG_PATH') || DEFAULT_CONFIG_PATH,
    bridgeName: value('TALKTOME_BRIDGE_NAME') || 'baresipui',
    authMode: value('TALKTOME_BRIDGE_AUTH_MODE') || 'bearer',
    autoProvisionEndpoints:
      process.env.TALKTOME_BRIDGE_AUTO_PROVISION !== 'false',
    commandTimeoutMs: enabled
      ? integerValue('TALKTOME_BRIDGE_COMMAND_TIMEOUT_MS', 5_000)
      : 5_000,
    defaultAudioSource: process.env.TALKTOME_DEFAULT_AUDIO_SOURCE || '',
    defaultAudioPlayer: process.env.TALKTOME_DEFAULT_AUDIO_PLAYER || '',
    accountsConfigPath:
      process.env.ACCOUNTS_CONFIG_PATH?.trim() || DEFAULT_ACCOUNTS_PATH,
  };
}

function value(name: string): string {
  return process.env[name]?.trim() || '';
}

function integerValue(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe integer`);
  }
  return parsed;
}
