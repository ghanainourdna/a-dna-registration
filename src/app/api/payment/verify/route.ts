import {
  fetchRegistrationPaymentRowForFinalize,
} from '@/lib/registration-payment-finalize';
import { syncOneRegistrationPaymentFromZeffy } from '@/lib/registration-payment-sync';
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

    const result = await syncOneRegistrationPaymentFromZeffy(supabase, row);

    if (result.outcome === 'error') {
      return NextResponse.json({ error: result.message }, { status: result.httpStatus });
    }

    if (result.outcome === 'rejected') {
      return NextResponse.json(
        {
          registrationId: result.registrationId,
          paymentStatus: 'failed',
          syncStatus: 'rejected',
          reason: result.reason,
        },
        { status: 400 },
      );
    }

    if (result.outcome === 'pending') {
      return NextResponse.json({
        registrationId: result.registrationId,
        paymentStatus: 'pending',
        syncStatus: 'pending',
        reason: result.reason,
      });
    }

    return NextResponse.json({
      registrationId: result.registrationId,
      paymentStatus: 'paid',
      amountUsd: result.amountUsd,
      ...(result.alreadyPaid ? { providerStatus: 'paid' } : { providerPaymentId: result.providerPaymentId }),
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
