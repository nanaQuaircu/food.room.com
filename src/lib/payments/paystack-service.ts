const PAYSTACK_BASE = 'https://api.paystack.co';

export type PaystackInitializeResult = {
  reference: string;
  access_code: string;
  authorization_url: string;
};

export type PaystackVerifyResult = {
  reference: string;
  amount: number;
  currency: string;
  paidAt: string;
  status: string;
};

function paystackReference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function createFrontDeskPaystackReference(propertyId: number) {
  return paystackReference(`FD${propertyId}`);
}

export function createBillingPaystackReference(propertyId: number, folioId: number) {
  return paystackReference(`BL${propertyId}F${folioId}`);
}

export function createWebsitePaystackReference(propertyId: number, reservationId: number) {
  return paystackReference(`WEB${propertyId}R${reservationId}`);
}

export function createFoodOrderPaystackReference(propertyId: number, orderId: number) {
  return paystackReference(`FOOD${propertyId}O${orderId}`);
}

export async function paystackInitialize(
  secretKey: string,
  params: {
    email: string;
    amount: number;
    reference: string;
    currency?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<PaystackInitializeResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email.trim(),
      amount: Math.round(params.amount * 100),
      reference: params.reference,
      currency: params.currency || 'GHS',
      metadata: params.metadata,
    }),
  });

  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: PaystackInitializeResult;
  };

  if (!res.ok || !json.status || !json.data?.reference) {
    throw new Error(json.message || 'Failed to initialize Paystack payment');
  }

  return json.data;
}

export async function paystackVerify(
  secretKey: string,
  reference: string
): Promise<PaystackVerifyResult> {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
    }
  );

  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: {
      reference: string;
      amount: number;
      currency: string;
      paid_at: string;
      status: string;
    };
  };

  if (!res.ok || !json.status || !json.data) {
    throw new Error(json.message || 'Failed to verify Paystack payment');
  }

  if (json.data.status !== 'success') {
    throw new Error(`Payment status: ${json.data.status}`);
  }

  return {
    reference: json.data.reference,
    amount: json.data.amount / 100,
    currency: json.data.currency,
    paidAt: json.data.paid_at,
    status: json.data.status,
  };
}
