import { executeCentral } from '@/lib/db/central';
import { findCompanyById } from '@/lib/tenant/tenant-service';
import type { Company } from '@/lib/db/types';

type SettingsMap = Record<string, string>;

const EMAIL_DEFAULTS = {
  host: 'sikasoftonline.net',
  port: 465,
  encryption: 'ssl',
  username: 'support@sikasoftonline.net',
  from_email: 'support@sikasoftonline.net',
  reply_to: 'info.owniterp@gmail.com',
};

function sikasoftEnvPassword() {
  return (process.env.SIKASOFT_SMTP_PASSWORD ?? '').trim();
}

function usesSikasoftHost(host: string) {
  return host.toLowerCase().includes('sikasoftonline.net');
}

function settingsMap(company: Company): SettingsMap {
  const raw = company.settings;
  if (!raw) return {};
  const obj = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : raw;
  if (!obj || typeof obj !== 'object') return {};
  const out: SettingsMap = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = String(v ?? '');
  }
  return out;
}

export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••••••';
  return `••••${value.slice(-4)}`;
}

function flag(settings: SettingsMap, key: string): boolean {
  return (settings[key] ?? '0') === '1';
}

export async function getCompanyBySessionId(companyId: number): Promise<Company | null> {
  return findCompanyById(companyId);
}

export function getPaystackSettings(company: Company) {
  const s = settingsMap(company);
  const secret = s.paystack_secret_key ?? '';
  const webhook = s.paystack_webhook_secret ?? '';
  return {
    paystack_enabled: flag(s, 'paystack_enabled'),
    paystack_mode: s.paystack_mode === 'live' ? 'live' : 'test',
    paystack_public_key: s.paystack_public_key ?? '',
    paystack_secret_configured: secret !== '',
    paystack_secret_masked: maskSecret(secret),
    paystack_webhook_configured: webhook !== '',
    paystack_webhook_masked: maskSecret(webhook),
  };
}

/** Server-side credentials for Paystack API calls. */
export function getPaystackRuntimeCredentials(company: Company) {
  const s = settingsMap(company);
  return {
    enabled: flag(s, 'paystack_enabled'),
    mode: s.paystack_mode === 'live' ? ('live' as const) : ('test' as const),
    publicKey: (s.paystack_public_key ?? '').trim(),
    secretKey: (s.paystack_secret_key ?? '').trim(),
  };
}

export function getHubtelRuntimeCredentials(company: Company) {
  const s = settingsMap(company);
  return {
    enabled: flag(s, 'hubtel_enabled'),
    clientId: (s.hubtel_client_id ?? '').trim(),
    clientSecret: (s.hubtel_client_secret ?? '').trim(),
    baseUrl: (s.hubtel_base_url || 'https://api.hubtel.com').trim(),
    pickupAddress: (s.hubtel_pickup_address ?? '').trim(),
    pickupPhone: (s.hubtel_pickup_phone ?? '').trim(),
    merchantAccount: (s.hubtel_merchant_account ?? '').trim(),
  };
}

export function getSmsSettings(company: Company) {
  const s = settingsMap(company);
  const apiKey = s.mnotify_api_key ?? '';
  return {
    mnotify_enabled: flag(s, 'mnotify_enabled'),
    mnotify_sender_id: s.mnotify_sender_id ?? '',
    mnotify_api_key_configured: apiKey !== '',
    mnotify_api_key_masked: maskSecret(apiKey),
  };
}

export function getEmailSettings(company: Company) {
  const s = settingsMap(company);
  const storedPassword = s.smtp_password ?? '';
  let host = s.smtp_host || EMAIL_DEFAULTS.host;
  let port = Number(s.smtp_port || EMAIL_DEFAULTS.port);
  let encryption = (s.smtp_encryption || EMAIL_DEFAULTS.encryption).toLowerCase();
  let username = s.smtp_username || EMAIL_DEFAULTS.username;
  let fromEmail = s.mail_from_email || EMAIL_DEFAULTS.from_email;
  const isSikasoft = usesSikasoftHost(host);

  if (!['tls', 'ssl', 'none'].includes(encryption)) encryption = 'ssl';
  if (isSikasoft) {
    port = 465;
    encryption = 'ssl';
    if (!fromEmail || fromEmail.includes('gmail.com')) {
      fromEmail = username || EMAIL_DEFAULTS.from_email;
    }
  }

  const effectivePassword = storedPassword || (isSikasoft ? sikasoftEnvPassword() : '');

  return {
    email_enabled: flag(s, 'email_enabled'),
    smtp_host: host,
    smtp_port: port,
    smtp_encryption: encryption,
    smtp_username: username,
    smtp_password_configured: effectivePassword !== '',
    smtp_password_masked: maskSecret(storedPassword || effectivePassword),
    mail_from_email: fromEmail,
    mail_from_name: s.mail_from_name ?? company.name,
    reply_to_email: s.reply_to_email || EMAIL_DEFAULTS.reply_to,
    uses_sikasoft: isSikasoft,
  };
}

export function getIntegrationSettings(company: Company) {
  return {
    paystack: getPaystackSettings(company),
    sms: getSmsSettings(company),
    email: getEmailSettings(company),
    hubtel: getHubtelSettings(company),
  };
}

export function getHubtelSettings(company: Company) {
  const s = settingsMap(company);
  const clientId = s.hubtel_client_id ?? '';
  const clientSecret = s.hubtel_client_secret ?? '';
  return {
    hubtel_enabled: flag(s, 'hubtel_enabled'),
    hubtel_client_id: clientId,
    hubtel_client_secret_configured: clientSecret !== '',
    hubtel_client_secret_masked: maskSecret(clientSecret),
    hubtel_base_url: (s.hubtel_base_url || 'https://api.hubtel.com').trim(),
    hubtel_pickup_address: (s.hubtel_pickup_address ?? '').trim(),
    hubtel_pickup_phone: (s.hubtel_pickup_phone ?? '').trim(),
    hubtel_merchant_account: (s.hubtel_merchant_account ?? '').trim(),
  };
}

async function saveSettings(companyId: number, patch: SettingsMap) {
  const company = await findCompanyById(companyId);
  if (!company) throw new Error('Hotel not found.');

  const current = settingsMap(company);
  const next = { ...current, ...patch };

  await executeCentral(`UPDATE companies SET settings = :settings WHERE id = :id`, {
    id: companyId,
    settings: JSON.stringify(next),
  });
}

export async function savePaystackSettings(
  companyId: number,
  data: {
    paystack_enabled?: boolean;
    paystack_mode?: string;
    paystack_public_key?: string;
    paystack_secret_key?: string;
    paystack_webhook_secret?: string;
  }
) {
  const company = await findCompanyById(companyId);
  if (!company) throw new Error('Hotel not found.');

  const existing = getPaystackSettings(company);
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

  const patch: SettingsMap = {
    paystack_enabled: enabled ? '1' : '0',
    paystack_mode: mode,
    paystack_public_key: publicKey,
  };
  if (secretKey) patch.paystack_secret_key = secretKey;
  if (webhookSecret) patch.paystack_webhook_secret = webhookSecret;

  await saveSettings(companyId, patch);
  return 'Paystack settings saved.';
}

export async function saveSmsSettings(
  companyId: number,
  data: {
    mnotify_enabled?: boolean;
    mnotify_sender_id?: string;
    mnotify_api_key?: string;
  }
) {
  const company = await findCompanyById(companyId);
  if (!company) throw new Error('Hotel not found.');

  const existing = getSmsSettings(company);
  const enabled = Boolean(data.mnotify_enabled);
  let senderId = String(data.mnotify_sender_id ?? '').trim();
  if (!senderId && existing.mnotify_sender_id) {
    senderId = existing.mnotify_sender_id;
  }
  const apiKey = String(data.mnotify_api_key ?? '').trim();

  if (enabled && !senderId) {
    throw new Error('Sender ID is required when mNotify SMS is enabled.');
  }
  if (enabled && senderId.length > 50) {
    throw new Error('Sender ID must be at most 50 characters.');
  }
  if (enabled && !apiKey && !existing.mnotify_api_key_configured) {
    throw new Error('API key is required when mNotify SMS is enabled.');
  }

  const patch: SettingsMap = {
    mnotify_enabled: enabled ? '1' : '0',
    mnotify_sender_id: senderId,
  };
  if (apiKey) patch.mnotify_api_key = apiKey;

  await saveSettings(companyId, patch);
  return 'mNotify SMS settings saved.';
}

export async function saveEmailSettings(
  companyId: number,
  data: {
    email_enabled?: boolean;
    smtp_host?: string;
    smtp_port?: number;
    smtp_encryption?: string;
    smtp_username?: string;
    smtp_password?: string;
    mail_from_email?: string;
    mail_from_name?: string;
    reply_to_email?: string;
  }
) {
  const company = await findCompanyById(companyId);
  if (!company) throw new Error('Hotel not found.');

  const existingPassword = settingsMap(company).smtp_password ?? '';
  const enabled = Boolean(data.email_enabled);
  let host = String(data.smtp_host ?? '').trim() || EMAIL_DEFAULTS.host;
  let port = Number(data.smtp_port ?? EMAIL_DEFAULTS.port);
  let encryption = String(data.smtp_encryption ?? EMAIL_DEFAULTS.encryption).toLowerCase();
  const username = String(data.smtp_username ?? '').trim() || EMAIL_DEFAULTS.username;
  let password = String(data.smtp_password ?? '').trim();
  let fromEmail = String(data.mail_from_email ?? '').trim() || EMAIL_DEFAULTS.from_email;
  const fromName = String(data.mail_from_name ?? '').trim() || company.name;
  const replyTo = String(data.reply_to_email ?? '').trim() || EMAIL_DEFAULTS.reply_to;
  const isSikasoft = usesSikasoftHost(host);
  const envPassword = sikasoftEnvPassword();

  if (!['tls', 'ssl', 'none'].includes(encryption)) encryption = 'ssl';
  if (isSikasoft) {
    port = 465;
    encryption = 'ssl';
    if (!fromEmail || fromEmail.includes('gmail.com')) {
      fromEmail = username;
    }
  }

  if (!password && existingPassword) {
    password = existingPassword;
  } else if (!password && isSikasoft && envPassword) {
    password = envPassword;
  }

  if (enabled && !password) {
    throw new Error('SMTP password is required when email notifications are enabled.');
  }

  const patch: SettingsMap = {
    email_enabled: enabled ? '1' : '0',
    smtp_host: host,
    smtp_port: String(port),
    smtp_encryption: encryption,
    smtp_username: username,
    mail_from_email: fromEmail,
    mail_from_name: fromName,
    reply_to_email: replyTo,
  };
  if (password) patch.smtp_password = password;

  await saveSettings(companyId, patch);
  return 'Email settings saved.';
}

export async function saveHubtelSettings(
  companyId: number,
  data: {
    hubtel_enabled?: boolean;
    hubtel_client_id?: string;
    hubtel_client_secret?: string;
    hubtel_base_url?: string;
    hubtel_pickup_address?: string;
    hubtel_pickup_phone?: string;
    hubtel_merchant_account?: string;
  }
) {
  const company = await findCompanyById(companyId);
  if (!company) throw new Error('Hotel not found.');
  const existing = getHubtelSettings(company);

  const enabled = Boolean(data.hubtel_enabled);
  const clientId = String(data.hubtel_client_id ?? '').trim();
  const clientSecret = String(data.hubtel_client_secret ?? '').trim();
  const baseUrl = String(data.hubtel_base_url ?? '').trim() || 'https://api.hubtel.com';
  const pickupAddress = String(data.hubtel_pickup_address ?? '').trim();
  const pickupPhone = String(data.hubtel_pickup_phone ?? '').trim();
  const merchantAccount = String(data.hubtel_merchant_account ?? '').trim();

  if (enabled && !clientId) {
    throw new Error('Hubtel client ID is required when Hubtel is enabled.');
  }
  if (enabled && !clientSecret && !existing.hubtel_client_secret_configured) {
    throw new Error('Hubtel client secret is required when Hubtel is enabled.');
  }
  if (enabled && !pickupAddress) {
    throw new Error('Kitchen / pickup address is required when Hubtel is enabled.');
  }

  const patch: SettingsMap = {
    hubtel_enabled: enabled ? '1' : '0',
    hubtel_client_id: clientId,
    hubtel_base_url: baseUrl,
    hubtel_pickup_address: pickupAddress,
    hubtel_pickup_phone: pickupPhone,
    hubtel_merchant_account: merchantAccount,
  };
  if (clientSecret) patch.hubtel_client_secret = clientSecret;

  await saveSettings(companyId, patch);
  return 'Hubtel settings saved.';
}

export function getSmsCredentials(company: Company) {
  const s = settingsMap(company);
  return {
    enabled: flag(s, 'mnotify_enabled'),
    apiKey: s.mnotify_api_key ?? '',
    senderId: s.mnotify_sender_id ?? '',
  };
}

export function getEmailCredentials(company: Company) {
  const email = getEmailSettings(company);
  const s = settingsMap(company);
  const stored = s.smtp_password ?? '';
  const smtp_password = stored || (email.uses_sikasoft ? sikasoftEnvPassword() : '');
  return {
    ...email,
    smtp_password,
  };
}
