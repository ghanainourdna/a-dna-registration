import { createHmac, timingSafeEqual } from 'node:crypto';

import { isAfricanCountryCode } from '@/lib/countries/africa';
import { centsFromUsd } from '@/lib/pricing';

const PAYSTACK_API_BASE = 'https://api.paystack.co';
const DEFAULT_USD_TO_GHS = 12;

export type PaystackCurrency = 'GHS' | 'USD';

export type PaystackCharge = {
  currency: PaystackCurrency;
  amountMinor: number;
  amountUsdCents: number;
  usdToGhs: number | null;
};

export type PaystackVerifiedTransaction = {
  id: number;
  reference: string;
  status: string;
  amountMinor: number;
  currency: string;
  channel: string | null;
  paidAt: string | null;
  email: string | null;
  payload: Record<string, unknown>;
};

/** Ghana and other African countries use Paystack (cards / mobile money). */
export function shouldUsePaystackCheckout(countryCode: string | null | undefined): boolean {
  return isAfricanCountryCode(countryCode);
}

export function paystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) {
    throw new Error('Missing PAYSTACK_SECRET_KEY');
  }
  return key;
}

export function resolvePaystackCurrency(): PaystackCurrency {
  return process.env.PAYSTACK_CURRENCY?.trim().toUpperCase() === 'USD' ? 'USD' : 'GHS';
}

export function resolveUsdToGhsRate(): number {
  const raw = process.env.PAYSTACK_USD_TO_GHS?.trim();
  const rate = raw ? Number.parseFloat(raw) : DEFAULT_USD_TO_GHS;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('PAYSTACK_USD_TO_GHS must be a positive number.');
  }
  return rate;
}

export function resolvePaystackCharge(totalUsd: number): PaystackCharge {
  const amountUsdCents = centsFromUsd(totalUsd);
  if (!Number.isFinite(totalUsd) || totalUsd <= 0 || amountUsdCents <= 0) {
    throw new Error('Invalid total amount.');
  }

  const currency = resolvePaystackCurrency();
  if (currency === 'USD') {
    return { currency, amountMinor: amountUsdCents, amountUsdCents, usdToGhs: null };
  }

  const usdToGhs = resolveUsdToGhsRate();
  return {
    currency,
    amountMinor: Math.round(totalUsd * usdToGhs * 100),
    amountUsdCents,
    usdToGhs,
  };
}

export function paystackChargeMatches(
  charge: PaystackCharge,
  verified: Pick<PaystackVerifiedTransaction, 'amountMinor' | 'currency'>,
): boolean {
  return (
    verified.currency.trim().toUpperCase() === charge.currency &&
    Math.round(verified.amountMinor) === Math.round(charge.amountMinor)
  );
}

export function verifyPaystackWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = paystackSecretKey();
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const received = signature?.trim() ?? '';
  if (!received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

async function paystackFetchJson(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${PAYSTACK_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${paystackSecretKey()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      json && typeof json === 'object' && 'message' in json && typeof json.message === 'string'
        ? json.message
        : `Paystack request failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

export async function initializePaystackTransaction(opts: {
  email: string;
  totalUsd: number;
  reference: string;
  registrationId: string;
  callbackUrl: string;
}): Promise<{ authorizationUrl: string; reference: string }> {
  const charge = resolvePaystackCharge(opts.totalUsd);
  const json = (await paystackFetchJson('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: opts.email,
      amount: charge.amountMinor,
      currency: charge.currency,
      reference: opts.reference,
      callback_url: opts.callbackUrl,
      metadata: {
        registration_id: opts.registrationId,
        amount_usd_cents: charge.amountUsdCents,
        custom_fields: [
          {
            display_name: 'Registration',
            variable_name: 'registration_id',
            value: opts.registrationId,
          },
        ],
      },
    }),
  })) as {
    status?: boolean;
    data?: { authorization_url?: string; reference?: string };
    message?: string;
  };

  const authorizationUrl = json.data?.authorization_url?.trim();
  const reference = json.data?.reference?.trim() || opts.reference;
  if (!json.status || !authorizationUrl) {
    throw new Error(json.message ?? 'Paystack did not return a checkout URL.');
  }
  return { authorizationUrl, reference };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parsePaystackTransactionData(data: unknown): PaystackVerifiedTransaction | null {
  const row = asRecord(data);
  if (!row) return null;
  const id = typeof row.id === 'number' ? row.id : Number.parseInt(String(row.id ?? ''), 10);
  const reference = typeof row.reference === 'string' ? row.reference.trim() : '';
  const status = typeof row.status === 'string' ? row.status.trim().toLowerCase() : '';
  const amountMinor =
    typeof row.amount === 'number' ? row.amount : Number.parseInt(String(row.amount ?? ''), 10);
  const currency = typeof row.currency === 'string' ? row.currency : '';
  if (!Number.isFinite(id) || !reference || !Number.isFinite(amountMinor) || !currency) {
    return null;
  }
  const customer = asRecord(row.customer);
  const email =
    typeof customer?.email === 'string'
      ? customer.email.trim().toLowerCase()
      : typeof row.email === 'string'
        ? row.email.trim().toLowerCase()
        : null;
  return {
    id,
    reference,
    status,
    amountMinor,
    currency,
    channel: typeof row.channel === 'string' ? row.channel : null,
    paidAt: typeof row.paid_at === 'string' ? row.paid_at : null,
    email,
    payload: row,
  };
}

export async function verifyPaystackTransaction(
  reference: string,
): Promise<PaystackVerifiedTransaction | null> {
  const json = (await paystackFetchJson(`/transaction/verify/${encodeURIComponent(reference)}`)) as {
    status?: boolean;
    data?: unknown;
  };
  if (!json.status) return null;
  return parsePaystackTransactionData(json.data);
}
