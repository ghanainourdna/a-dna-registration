import { sendPaidRegistrationConfirmationIfNeeded } from '@/lib/email/send-registration-confirmation';
import {
  finalizeRegistrationPaymentForRow,
  resolveRegistrationRowForZeffyWebhook,
  type RegistrationPaymentRow,
} from '@/lib/registration-payment-finalize';
import { coerceZeffyPaymentShape, extractEmailsDeep, extractWebhookPayment } from '@/lib/zeffy-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 524_288;

function eventLooksCompleted(body: Record<string, unknown>): boolean {
  const t = `${body.type ?? body.event ?? ''}`.toLowerCase();
  return t.includes('payment.completed') || t.includes('payment_completed');
}

export async function POST(req: NextRequest): Promise<Response> {
  const expectedBearer = process.env.ZEFFY_WEBHOOK_BEARER?.trim();
  if (expectedBearer) {
    const auth = req.headers.get('authorization')?.trim() ?? '';
    if (auth !== `Bearer ${expectedBearer}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
  }

  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(req, MAX_BODY_BYTES);
  } catch {
    return new Response(JSON.stringify({ error: 'payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!eventLooksCompleted(envelope)) {
    return new Response(null, { status: 200 });
  }

  const payment = extractWebhookPayment(envelope);
  if (!payment) {
    return new Response(null, { status: 200 });
  }

  const coerced = coerceZeffyPaymentShape(payment);
  const emailSet = new Set<string>();
  extractEmailsDeep(envelope, emailSet);
  extractEmailsDeep(payment, emailSet);
  const payerEmail = [...emailSet][0]?.trim().toLowerCase() ?? '';

  if (!coerced || coerced.amountCents == null || coerced.status !== 'succeeded') {
    return new Response(null, { status: 200 });
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return new Response(JSON.stringify({ error: 'database not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Idempotent: replays reuse the immutable audit row and skip duplicate finalization attempts. */
  const { error: insertError } = await supabase.from('provider_payment_audit').insert({
    provider: 'zeffy',
    external_payment_id: coerced.id,
    event_type: 'payment.completed',
    registration_id: null,
    amount_cents: coerced.amountCents,
    currency: coerced.currencyLower.toUpperCase(),
    status: coerced.status,
    payload: JSON.parse(JSON.stringify(envelope)) as Record<string, unknown>,
  });

  const duplicateWebhook =
    !!insertError && (insertError.code === '23505' || /duplicate key value/i.test(insertError.message ?? ''));

  if (duplicateWebhook) {
    const { data: audit } = await supabase
      .from('provider_payment_audit')
      .select('registration_id')
      .eq('provider', 'zeffy')
      .eq('external_payment_id', coerced.id)
      .maybeSingle();
    if (audit?.registration_id) {
      await sendPaidRegistrationConfirmationIfNeeded(supabase, audit.registration_id as string);
      return new Response(null, { status: 200 });
    }
  }

  if (insertError) {
    console.error('[zeffy webhook] audit insert', insertError.message);
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
  }

  const resolved = await resolveRegistrationRowForZeffyWebhook({
    supabase,
    payerEmailLower: payerEmail,
    envelope,
    paymentObject: payment,
    verifiedAmountCents: coerced.amountCents,
  });

  let row: RegistrationPaymentRow | undefined;

  if ('rejectReason' in resolved) {
    console.warn('[zeffy webhook] unresolved', resolved.rejectReason);
    return new Response(null, { status: 200 });
  }
  if ('ambiguous' in resolved && resolved.ambiguous) {
    console.warn('[zeffy webhook] ambiguous_registration_match');
    return new Response(null, { status: 200 });
  }
  if ('row' in resolved) {
    row = resolved.row;
  }

  if (!row) {
    return new Response(null, { status: 200 });
  }

  const fin = await finalizeRegistrationPaymentForRow(supabase, row, coerced.id, coerced.amountCents);

  if (fin.outcome === 'db_error') {
    console.error('[zeffy webhook] finalize db', fin.message);
    return new Response(JSON.stringify({ error: 'finalize_failed' }), { status: 500 });
  }

  if (fin.outcome !== 'paid' && fin.outcome !== 'already_paid') {
    console.warn('[zeffy webhook] finalize rejected', fin);
    return new Response(null, { status: 200 });
  }

  const regId = fin.registrationId;
  const patch = await supabase
    .from('provider_payment_audit')
    .update({ registration_id: regId })
    .eq('provider', 'zeffy')
    .eq('external_payment_id', coerced.id);

  if (patch.error) {
    console.warn('[zeffy webhook] audit registration_id patch', patch.error.message);
  }

  await sendPaidRegistrationConfirmationIfNeeded(supabase, regId);

  return new Response(null, { status: 200 });
}

async function readBodyWithLimit(req: NextRequest, maxBytes: number): Promise<string> {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error('body too large');
  return new TextDecoder().decode(buf);
}
