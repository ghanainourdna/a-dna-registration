import {
  fetchRegistrationPaymentRowForFinalize,
  finalizeRegistrationPaymentForRow,
} from '@/lib/registration-payment-finalize';
import { trustedZeffyPaymentForPendingRegistration } from '@/lib/zeffy-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: { registrationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const registrationId = body.registrationId?.trim();

  if (!registrationId) {
    return NextResponse.json({ error: 'registrationId is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const row = await fetchRegistrationPaymentRowForFinalize(supabase, registrationId);
    if (!row) {
      return NextResponse.json({ error: 'Registration not found.' }, { status: 404 });
    }

    const totalUsd = typeof row.total_amount === 'string' ? Number.parseFloat(row.total_amount) : row.total_amount;

    if (row.payment_status === 'paid') {
      return NextResponse.json({
        registrationId: row.id,
        paymentStatus: 'paid',
        amountUsd: totalUsd,
        providerStatus: 'paid',
      });
    }

    if (!row.email) {
      return NextResponse.json({ error: 'Registration email unavailable.' }, { status: 500 });
    }

    const match = await trustedZeffyPaymentForPendingRegistration({
      email: row.email.trim().toLowerCase(),
      expectedUsd: totalUsd,
      checkoutToken: row.checkout_correlation_reference,
    });

    if ('error' in match) {
      return NextResponse.json({ error: match.error }, { status: 503 });
    }

    if ('notFoundReason' in match) {
      return NextResponse.json({
        registrationId: row.id,
        paymentStatus: row.payment_status,
        syncStatus: 'pending',
        reason: match.notFoundReason,
      });
    }

    const fin = await finalizeRegistrationPaymentForRow(supabase, row, match.paymentId, match.amountCents);

    if (fin.outcome === 'rejected') {
      return NextResponse.json(
        {
          registrationId: row.id,
          paymentStatus: 'failed',
          syncStatus: 'rejected',
          reason: fin.reason,
        },
        { status: 400 },
      );
    }

    if (fin.outcome === 'db_error') {
      return NextResponse.json({ error: fin.message }, { status: 500 });
    }

    return NextResponse.json({
      registrationId: fin.registrationId,
      paymentStatus: 'paid',
      amountUsd: totalUsd,
      providerPaymentId: match.paymentId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Verification failed';
    const status =
      typeof msg === 'string' &&
      (msg.includes('Missing ZEFFY_API_KEY') || msg.includes('Missing SUPABASE_SERVICE_ROLE_KEY'))
        ? 503
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
