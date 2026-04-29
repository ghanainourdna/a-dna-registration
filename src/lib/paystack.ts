import { centsFromUsd } from '@/lib/pricing';

const PAYSTACK_BASE = 'https://api.paystack.co';

function authHeader() {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error('Missing PAYSTACK_SECRET_KEY');
  }
  return {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  } as const;
}

export type PaystackInitializeInput = {
  email: string;
  amountUsd: number;
  reference: string;
  fullName: string;
  phone?: string | null;
  callbackUrl: string;
  metadata: Record<string, string>;
};

export async function paystackInitializeTransaction(input: PaystackInitializeInput) {
  const amountCents = centsFromUsd(input.amountUsd);
  if (amountCents <= 0) {
    throw new Error('Invalid Paystack amount');
  }

  const meta: Record<string, string> = {
    ...input.metadata,
    full_name: input.fullName,
  };
  if (input.phone) {
    meta.phone = input.phone;
  }

  const body = {
    email: input.email,
    amount: amountCents,
    currency: 'USD',
    reference: input.reference,
    callback_url: input.callbackUrl,
    metadata: meta,
  };

  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!res.ok || !json.status || !json.data?.authorization_url) {
    throw new Error(json.message || 'Paystack initialization failed');
  }

  return json.data;
}

export type PaystackVerifyResult = {
  ok: boolean;
  status: string;
  amountCents: number;
  reference: string;
  metadata?: Record<string, unknown>;
};

export async function paystackVerifyTransaction(reference: string): Promise<PaystackVerifyResult> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: authHeader(),
    cache: 'no-store',
  });

  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: {
      status: string;
      amount: number;
      currency: string;
      reference: string;
      metadata?: Record<string, unknown>;
    };
  };

  if (!json.data) {
    return { ok: false, status: 'unknown', amountCents: 0, reference };
  }

  const amount = json.data.amount;
  return {
    ok: json.status === true && json.data.status === 'success',
    status: json.data.status ?? 'unknown',
    amountCents: amount,
    reference: json.data.reference ?? reference,
    metadata: json.data.metadata,
  };
}
