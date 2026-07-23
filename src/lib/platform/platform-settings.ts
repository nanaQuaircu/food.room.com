import { executeCentral, queryCentral } from '@/lib/db/central';
import { maskSecret } from '@/lib/services/company-settings-service';

export const PLATFORM_PAYSTACK_KEYS = {
  enabled: 'paystack_enabled',
  mode: 'paystack_mode',
  publicKey: 'paystack_public_key',
  secretKey: 'paystack_secret_key',
  webhookSecret: 'paystack_webhook_secret',
} as const;

type SettingRow = { setting_key: string; setting_value: string | null };

export async function getPlatformSettingsMap(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};

  const rows = await queryCentral<SettingRow[]>(
    `SELECT setting_key, setting_value FROM platform_settings
     WHERE setting_key IN (
       'paystack_enabled', 'paystack_mode', 'paystack_public_key',
       'paystack_secret_key', 'paystack_webhook_secret'
     )`
  );

  const wanted = new Set(keys);
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (!wanted.has(row.setting_key)) continue;
    out[row.setting_key] = String(row.setting_value ?? '').trim();
  }
  return out;
}

export async function getPlatformSetting(key: string): Promise<string> {
  const map = await getPlatformSettingsMap([key]);
  return map[key] ?? '';
}

export async function setPlatformSettings(entries: Record<string, string>) {
  for (const [setting_key, setting_value] of Object.entries(entries)) {
    await executeCentral(
      `INSERT INTO platform_settings (setting_key, setting_value)
       VALUES (:setting_key, :setting_value)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      { setting_key, setting_value }
    );
  }
}

export type PlatformPaystackAdminView = {
  paystack_enabled: boolean;
  paystack_mode: 'test' | 'live';
  paystack_public_key: string;
  paystack_secret_configured: boolean;
  paystack_secret_masked: string;
  paystack_webhook_configured: boolean;
  paystack_webhook_masked: string;
  env_fallback_active: boolean;
};

function envPaystack() {
  return {
    secretKey: (process.env.PAYSTACK_SECRET_KEY || '').trim(),
    publicKey: (
      process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ||
      process.env.PAYSTACK_PUBLIC_KEY ||
      ''
    ).trim(),
    webhookSecret: (process.env.PAYSTACK_WEBHOOK_SECRET || '').trim(),
  };
}

export async function getPlatformPaystackAdminView(): Promise<PlatformPaystackAdminView> {
  const map = await getPlatformSettingsMap(Object.values(PLATFORM_PAYSTACK_KEYS));
  const env = envPaystack();

  const dbSecret = map[PLATFORM_PAYSTACK_KEYS.secretKey] ?? '';
  const dbWebhook = map[PLATFORM_PAYSTACK_KEYS.webhookSecret] ?? '';
  const dbPublic = map[PLATFORM_PAYSTACK_KEYS.publicKey] ?? '';
  const enabledRaw = map[PLATFORM_PAYSTACK_KEYS.enabled];
  const modeRaw = map[PLATFORM_PAYSTACK_KEYS.mode];

  const secretConfigured = Boolean(dbSecret || env.secretKey);
  const webhookConfigured = Boolean(dbWebhook || env.webhookSecret);
  const secretForMask = dbSecret || env.secretKey;
  const webhookForMask = dbWebhook || env.webhookSecret;

  const envFallbackActive = Boolean(
    (!dbSecret && env.secretKey) ||
      (!dbPublic && env.publicKey) ||
      (!dbWebhook && env.webhookSecret)
  );

  return {
    paystack_enabled: enabledRaw === '0' ? false : enabledRaw === '1' ? true : secretConfigured && Boolean(dbPublic || env.publicKey),
    paystack_mode: modeRaw === 'live' ? 'live' : 'test',
    paystack_public_key: dbPublic || env.publicKey,
    paystack_secret_configured: secretConfigured,
    paystack_secret_masked: maskSecret(secretForMask),
    paystack_webhook_configured: webhookConfigured,
    paystack_webhook_masked: maskSecret(webhookForMask),
    env_fallback_active: envFallbackActive,
  };
}

export async function savePlatformPaystackSettings(data: {
  paystack_enabled?: boolean;
  paystack_mode?: string;
  paystack_public_key?: string;
  paystack_secret_key?: string;
  paystack_webhook_secret?: string;
}) {
  const existing = await getPlatformPaystackAdminView();
  const enabled = Boolean(data.paystack_enabled);
  const mode = data.paystack_mode === 'live' ? 'live' : 'test';
  const publicKey = String(data.paystack_public_key ?? '').trim();
  const secretKey = String(data.paystack_secret_key ?? '').trim();
  const webhookSecret = String(data.paystack_webhook_secret ?? '').trim();

  if (enabled && !publicKey) {
    throw new Error('Public key is required when Paystack is enabled.');
  }
  if (enabled && !secretKey && !existing.paystack_secret_configured) {
    throw new Error('Secret key is required when Paystack is enabled.');
  }

  const patch: Record<string, string> = {
    [PLATFORM_PAYSTACK_KEYS.enabled]: enabled ? '1' : '0',
    [PLATFORM_PAYSTACK_KEYS.mode]: mode,
    [PLATFORM_PAYSTACK_KEYS.publicKey]: publicKey,
  };
  if (secretKey) patch[PLATFORM_PAYSTACK_KEYS.secretKey] = secretKey;
  if (webhookSecret) patch[PLATFORM_PAYSTACK_KEYS.webhookSecret] = webhookSecret;

  await setPlatformSettings(patch);
  return 'Platform Paystack settings saved.';
}

/** Runtime credentials: DB values win; empty fields fall back to env. */
export async function resolvePlatformPaystackCredentials() {
  const map = await getPlatformSettingsMap(Object.values(PLATFORM_PAYSTACK_KEYS));
  const env = envPaystack();

  const secretKey = (map[PLATFORM_PAYSTACK_KEYS.secretKey] || env.secretKey).trim();
  const publicKey = (map[PLATFORM_PAYSTACK_KEYS.publicKey] || env.publicKey).trim();
  const webhookSecret = (map[PLATFORM_PAYSTACK_KEYS.webhookSecret] || env.webhookSecret).trim();

  const enabledRaw = map[PLATFORM_PAYSTACK_KEYS.enabled];
  const toggleOn =
    enabledRaw === '0' ? false : enabledRaw === '1' ? true : Boolean(secretKey && publicKey);

  return {
    enabled: toggleOn && Boolean(secretKey && publicKey),
    secretKey,
    publicKey,
    webhookSecret,
    mode: (map[PLATFORM_PAYSTACK_KEYS.mode] === 'live' ? 'live' : 'test') as 'test' | 'live',
  };
}
