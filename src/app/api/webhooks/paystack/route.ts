import { finalizeRegistrationPaymentFromTrustedPaystackCharge } from '@/lib/paystack-registration-finalize';
import { verifyPaystackWebhookSignature } from '@/lib/paystack-webhook-signature';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

import type { NextRequest } from 'next/server';

export const runtime = 'edge';

/** Max JSON payload size (~512KB typical for gateways) */
const MAX_BODY_BYTES = 524_288;

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

type ChargeShape = Record<string, unknown>;

function coerceCharge(envelope: { event?: string; data?: unknown }): {
  paystackTransactionId: number;
  charge: ChargeShape;
} | null {
  const raw = envelope.data;
  if (!raw || typeof raw !== 'object') return null;
  const charge = raw as ChargeShape;
  const idRaw = charge.id;
  let paystackTransactionId: number;
  if (typeof idRaw === 'number' && Number.isFinite(idRaw)) {
    paystackTransactionId = idRaw;
  } else if (typeof idRaw === 'string' && /^\d+$/.test(idRaw)) {
    paystackTransactionId = Number.parseInt(idRaw, 10);
  } else {
    return null;
  }
  return { paystackTransactionId, charge };
}

export async function POST(req: NextRequest): Promise<Response> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    return new Response(JSON.stringify({ error: 'PAYSTACK_SECRET_KEY not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sig = req.headers.get('x-paystack-signature') ?? req.headers.get('X-Paystack-Signature');

  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(req, MAX_BODY_BYTES);
  } catch {
    return new Response(JSON.stringify({ error: 'payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!(await verifyPaystackWebhookSignature(rawBody, sig, secret))) {
    return new Response(JSON.stringify({ error: 'invalid signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let envelope: { event?: string; data?: unknown };
  try {
    envelope = JSON.parse(rawBody) as { event?: string; data?: unknown };
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const event = envelope.event ?? 'unknown';

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return new Response(JSON.stringify({ error: 'database not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = coerceCharge(envelope);

  /** Always persist audited payload when Paystack sends a transaction id */
  if (parsed) {
    const { charge, paystackTransactionId } = parsed;

    const reference = typeof charge.reference === 'string' ? charge.reference : '';
    const amountCents = typeof charge.amount === 'number' && Number.isFinite(charge.amount) ? Math.round(charge.amount) : 0;
    const currency = typeof charge.currency === 'string' ? charge.currency : 'USD';
    const statusStr = typeof charge.status === 'string' ? charge.status : 'unknown';
    const channel = typeof charge.channel === 'string' ? charge.channel : null;
    const paidAt = typeof charge.paid_at === 'string' ? charge.paid_at : null;

    const meta =
      charge.metadata && typeof charge.metadata === 'object' ? (charge.metadata as Record<string, unknown>) : undefined;
    const ridRaw =
      typeof meta?.registration_id === 'string'
        ? meta.registration_id
        : meta?.registration_id != null
          ? String(meta.registration_id)
          : null;
    const registrationId = ridRaw && isUuidLike(ridRaw) ? ridRaw.trim() : null;

    const { error: insertError } = await supabase.from('paystack_transactions').insert({
      paystack_id: paystackTransactionId,
      event,
      reference,
      registration_id: registrationId,
      amount_cents: amountCents,
      currency,
      status: statusStr,
      channel,
      paid_at: paidAt,
      payload: JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>,
    });

    const duplicateWebhook =
      !!insertError &&
      (insertError.code === '23505' || /duplicate key value/i.test(insertError.message ?? ''));

    if (insertError && !duplicateWebhook) {
      console.error('[paystack webhook] insert transaction', insertError.message);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (
      event === 'charge.success' &&
      statusStr === 'success' &&
      reference &&
      amountCents > 0
    ) {
      const finalize = await finalizeRegistrationPaymentFromTrustedPaystackCharge(supabase, {
        reference,
        amountCents,
        registrationIdFromMeta: registrationId ?? undefined,
      });

      if (finalize.outcome === 'db_error') {
        console.error('[paystack webhook] finalize', finalize.message);
        return new Response(JSON.stringify({ error: 'finalize failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
  }

  return new Response(null, { status: 200 });
}

async function readBodyWithLimit(req: NextRequest, maxBytes: number): Promise<string> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error('body too large');
  return new TextDecoder().decode(buf);
}
