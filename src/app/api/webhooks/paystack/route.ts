import { sendPaidRegistrationConfirmationIfNeeded } from '@/lib/email/send-registration-confirmation';
import {
  parsePaystackTransactionData,
  verifyPaystackWebhookSignature,
} from '@/lib/paystack';
import {
  fetchRegistrationPaymentRowForFinalize,
  findRegistrationByCorrelationToken,
  finalizePaystackRegistrationPayment,
} from '@/lib/registration-payment-finalize';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 524_288;

export async function POST(req: NextRequest): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(req, MAX_BODY_BYTES);
  } catch {
    return jsonError('payload too large', 413);
  }

  try {
    if (!verifyPaystackWebhookSignature(rawBody, req.headers.get('x-paystack-signature'))) {
      return jsonError('Unauthorized', 401);
    }
  } catch {
    return jsonError('Paystack is not configured', 503);
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonError('invalid JSON', 400);
  }

  const event = `${envelope.event ?? ''}`.toLowerCase();
  if (event !== 'charge.success') {
    return new Response(null, { status: 200 });
  }

  const verified = parsePaystackTransactionData(envelope.data);
  if (!verified || verified.status !== 'success') {
    return new Response(null, { status: 200 });
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return jsonError('database not configured', 503);
  }

  const metadata =
    verified.payload.metadata && typeof verified.payload.metadata === 'object'
      ? (verified.payload.metadata as Record<string, unknown>)
      : {};
  const metadataRegistrationId =
    typeof metadata.registration_id === 'string' ? metadata.registration_id.trim() : '';

  const row =
    (metadataRegistrationId
      ? await fetchRegistrationPaymentRowForFinalize(supabase, metadataRegistrationId)
      : null) ?? (await findRegistrationByCorrelationToken(supabase, verified.reference));

  if (!row) {
    console.warn('[paystack webhook] registration not found', verified.reference);
    return new Response(null, { status: 200 });
  }

  const fin = await finalizePaystackRegistrationPayment(supabase, row, verified);
  if (fin.outcome === 'db_error') {
    console.error('[paystack webhook] finalize db', fin.message);
    return jsonError('finalize_failed', 500);
  }
  if (fin.outcome === 'paid' || fin.outcome === 'already_paid') {
    await sendPaidRegistrationConfirmationIfNeeded(supabase, fin.registrationId);
  }
  return new Response(null, { status: 200 });
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readBodyWithLimit(req: NextRequest, maxBytes: number): Promise<string> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error('body too large');
  return new TextDecoder().decode(buf);
}
