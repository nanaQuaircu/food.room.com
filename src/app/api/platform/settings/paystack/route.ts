import { NextRequest } from 'next/server';
import { getSession } from '@/lib/tenant/session';
import { apiOk, apiFail } from '@/lib/api/json';
import {
  getPlatformPaystackAdminView,
  savePlatformPaystackSettings,
} from '@/lib/platform/platform-settings';

export async function GET() {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return apiFail('Unauthorized', 401);
  }

  try {
    const data = await getPlatformPaystackAdminView();
    return apiOk(data);
  } catch (e) {
    console.error(e);
    return apiFail('Failed to load Paystack settings', 500);
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session || session.type !== 'platform') {
    return apiFail('Unauthorized', 401);
  }

  try {
    const body = await request.json();
    const message = await savePlatformPaystackSettings({
      paystack_enabled: Boolean(body.paystack_enabled),
      paystack_mode: String(body.paystack_mode || 'test'),
      paystack_public_key: String(body.paystack_public_key || ''),
      paystack_secret_key: String(body.paystack_secret_key || ''),
      paystack_webhook_secret: String(body.paystack_webhook_secret || ''),
    });
    const data = await getPlatformPaystackAdminView();
    return apiOk(data, message);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'Failed to save Paystack settings';
    return apiFail(message, 400);
  }
}
