export type HubtelDeliveryQuote = {
  provider: 'hubtel';
  fee: number;
  eta_minutes: number;
  currency: string;
  quote_id?: string | null;
  source: 'live' | 'estimated';
};

export type HubtelDeliveryDispatch = {
  provider: 'hubtel';
  tracking_ref: string | null;
  status: string;
  fee: number;
  eta_minutes: number;
  source: 'live' | 'queued';
  raw?: unknown;
};

export type HubtelCredentials = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  pickupAddress?: string;
  pickupPhone?: string;
  merchantAccount?: string;
};

function authHeader(creds: HubtelCredentials) {
  const token = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  return `Basic ${token}`;
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

function estimateLocally(address: string): HubtelDeliveryQuote {
  const normalized = address.trim();
  const fee = normalized.length > 40 ? 25 : 15;
  const eta = normalized.length > 40 ? 55 : 35;
  return {
    provider: 'hubtel',
    fee,
    eta_minutes: eta,
    currency: 'GHS',
    quote_id: null,
    source: 'estimated',
  };
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function hubtelFetch(
  creds: HubtelCredentials,
  path: string,
  init: RequestInit
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${normalizeBaseUrl(creds.baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader(creds),
      ...(init.headers || {}),
    },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Quote a Hubtel-backed delivery.
 * Tries live Hubtel endpoints first; falls back to a local estimate when the
 * merchant account has no logistics product or the API is unreachable.
 */
export async function estimateHubtelDelivery(input: {
  address: string;
  creds?: HubtelCredentials;
  pickupAddress?: string;
  pickupPhone?: string;
}): Promise<HubtelDeliveryQuote> {
  const destination = input.address.trim();
  if (!destination) throw new Error('Delivery address is required.');

  const fallback = estimateLocally(destination);
  const creds = input.creds;
  if (!creds?.enabled || !creds.clientId || !creds.clientSecret) {
    return fallback;
  }

  const payload = {
    From: {
      Address: input.pickupAddress || creds.pickupAddress || '',
      PhoneNumber: input.pickupPhone || creds.pickupPhone || '',
    },
    To: {
      Address: destination,
    },
    MerchantAccountNumber: creds.merchantAccount || undefined,
    Description: 'Hotel food delivery',
  };

  const quotePaths = ['/v1/merchantaccount/delivery/quote', '/v1/deliveries/quote', '/v2/delivery/quote'];

  for (const path of quotePaths) {
    try {
      const result = await hubtelFetch(creds, path, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!result.ok) continue;

      const body = result.data?.data ?? result.data ?? {};
      const fee = pickNumber(body.Fee, body.fee, body.Amount, body.amount, body.DeliveryFee);
      const eta = pickNumber(body.EtaMinutes, body.eta_minutes, body.ETA, body.estimatedMinutes);
      const quoteId = pickString(body.QuoteId, body.quoteId, body.Id, body.id, body.Reference);

      if (fee != null) {
        return {
          provider: 'hubtel',
          fee,
          eta_minutes: eta ?? fallback.eta_minutes,
          currency: pickString(body.Currency, body.currency) || 'GHS',
          quote_id: quoteId,
          source: 'live',
        };
      }
    } catch {
      // try next path
    }
  }

  return fallback;
}

/**
 * Dispatch a delivery job to Hubtel after the food order is created.
 * If live dispatch fails, returns a queued status so staff can fulfill manually.
 */
export async function createHubtelDelivery(input: {
  creds: HubtelCredentials;
  orderId: number;
  destinationAddress: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
  fee: number;
  etaMinutes?: number;
  quoteId?: string | null;
  paymentMode: 'prepaid' | 'cash_on_delivery';
  itemDescription?: string;
}): Promise<HubtelDeliveryDispatch> {
  const destination = input.destinationAddress.trim();
  if (!destination) throw new Error('Delivery address is required.');

  const queued: HubtelDeliveryDispatch = {
    provider: 'hubtel',
    tracking_ref: `LOCAL-${input.orderId}`,
    status: 'queued',
    fee: input.fee,
    eta_minutes: input.etaMinutes || 45,
    source: 'queued',
  };

  if (!input.creds.enabled || !input.creds.clientId || !input.creds.clientSecret) {
    return queued;
  }

  const payload = {
    ClientReference: `FOOD-${input.orderId}`,
    QuoteId: input.quoteId || undefined,
    Description: input.itemDescription || `Food order #${input.orderId}`,
    Notes: input.notes || undefined,
    Amount: input.fee,
    PaymentMode: input.paymentMode === 'cash_on_delivery' ? 'CashOnDelivery' : 'Prepaid',
    MerchantAccountNumber: input.creds.merchantAccount || undefined,
    From: {
      Address: input.creds.pickupAddress || '',
      PhoneNumber: input.creds.pickupPhone || '',
      Name: 'Hotel Kitchen',
    },
    To: {
      Address: destination,
      Name: input.customerName || 'Guest',
      PhoneNumber: input.customerPhone || '',
      Email: input.customerEmail || undefined,
    },
  };

  const createPaths = [
    '/v1/merchantaccount/delivery/orders',
    '/v1/deliveries',
    '/v2/delivery/orders',
  ];

  for (const path of createPaths) {
    try {
      const result = await hubtelFetch(input.creds, path, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!result.ok) continue;

      const body = result.data?.data ?? result.data ?? {};
      const tracking = pickString(
        body.TrackingNumber,
        body.trackingNumber,
        body.TrackingId,
        body.Id,
        body.id,
        body.Reference,
        body.ClientReference
      );
      const status = pickString(body.Status, body.status) || 'dispatched';

      return {
        provider: 'hubtel',
        tracking_ref: tracking,
        status,
        fee: pickNumber(body.Fee, body.fee, body.Amount) ?? input.fee,
        eta_minutes: pickNumber(body.EtaMinutes, body.eta_minutes) ?? input.etaMinutes ?? 45,
        source: 'live',
        raw: result.data,
      };
    } catch {
      // try next path
    }
  }

  return queued;
}
