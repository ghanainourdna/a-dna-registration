import {
  finalizeRegistrationPaymentFromTrustedPaystackCharge,
  findRegistrationForPaystack,
} from '@/lib/paystack-registration-finalize';
import { paystackVerifyTransaction } from '@/lib/paystack';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { reference?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.reference?.trim()) {
    return NextResponse.json({ error: 'reference is required' }, { status: 400 });
  }

  const reference = body.reference.trim();

  try {
    const supabase = getSupabaseAdmin();

    const paystackResult = await paystackVerifyTransaction(reference);

    const registrationIdRaw = paystackResult.metadata?.registration_id;
    const metaRegistrationId = typeof registrationIdRaw === 'string' ? registrationIdRaw : '';

    const found = await findRegistrationForPaystack(supabase, reference, metaRegistrationId || undefined);

    if (!found.row) {
      return NextResponse.json({ error: 'Registration not found.' }, { status: 404 });
    }

    if (found.metaMismatch) {
      return NextResponse.json({ error: 'Metadata does not match registration.' }, { status: 400 });
    }

    if (!paystackResult.ok) {
      await supabase.from('conference_registrations').update({ payment_status: 'failed' }).eq('id', found.row.id);
      return NextResponse.json({ paymentStatus: 'failed', paystackStatus: paystackResult.status }, { status: 200 });
    }

    const fin = await finalizeRegistrationPaymentFromTrustedPaystackCharge(supabase, {
      reference,
      amountCents: paystackResult.amountCents,
      registrationIdFromMeta: metaRegistrationId || undefined,
      cachedRow: found.row,
    });

    const totalUsd =
      typeof found.row.total_amount === 'string' ? Number.parseFloat(found.row.total_amount) : found.row.total_amount;

    if (fin.outcome === 'rejected') {
      const payload =
        fin.reason === 'pricing_mismatch'
          ? { error: 'Pricing mismatch.', status: 'failed' as const }
          : fin.reason === 'amount_mismatch' || fin.reason === 'invalid_total'
            ? { error: 'Amount mismatch.', status: 'failed' as const }
            : { error: 'Payment could not be confirmed.', status: 'failed' as const };
      return NextResponse.json(payload, { status: 400 });
    }

    if (fin.outcome === 'db_error') {
      return NextResponse.json({ error: fin.message }, { status: 500 });
    }

    return NextResponse.json({
      registrationId: found.row.id,
      paymentStatus: 'paid',
      amountUsd: totalUsd,
      reference,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Verification failed';
    const status =
      typeof msg === 'string' && (msg.includes('Missing PAYSTACK_SECRET_KEY') || msg.includes('Missing SUPABASE_SERVICE_ROLE_KEY'))
        ? 503
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
