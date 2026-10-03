import { sendPaidRegistrationConfirmationIfNeeded } from '@/lib/email/send-registration-confirmation';
import { shouldUsePaystackCheckout, verifyPaystackTransaction } from '@/lib/paystack';
import {
  fetchRegistrationPaymentRowForFinalize,
  finalizePaystackRegistrationPayment,
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

    if (row.payment_status === 'paid') {
      await sendPaidRegistrationConfirmationIfNeeded(supabase, row.id);
      const amountUsd =
        typeof row.total_amount === 'string' ? Number.parseFloat(row.total_amount) : row.total_amount;
      return NextResponse.json({
        registrationId: row.id,
        paymentStatus: 'paid',
        amountUsd,
        providerStatus: 'paid',
      });
    }

    if (shouldUsePaystackCheckout(row.country) && row.checkout_correlation_reference) {
      const paystack = await verifyPaystackTransaction(row.checkout_correlation_reference);
      if (paystack && paystack.status === 'success') {
        const fin = await finalizePaystackRegistrationPayment(supabase, row, paystack);
        if (fin.outcome === 'db_error') {
          return NextResponse.json({ error: fin.message }, { status: 500 });
        }
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
        await sendPaidRegistrationConfirmationIfNeeded(supabase, fin.registrationId);
        const amountUsd =
          typeof row.total_amount === 'string' ? Number.parseFloat(row.total_amount) : row.total_amount;
        return NextResponse.json({
          registrationId: fin.registrationId,
          paymentStatus: 'paid',
          amountUsd,
          providerStatus: fin.outcome === 'already_paid' ? 'paid' : undefined,
          providerPaymentId: String(paystack.id),
        });
      }

      return NextResponse.json({
        registrationId: row.id,
        paymentStatus: 'pending',
        syncStatus: 'pending',
        reason: 'waiting_for_paystack',
      });
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
      (msg.includes('Missing ZEFFY_API_KEY') ||
        msg.includes('Missing SUPABASE_SERVICE_ROLE_KEY') ||
        msg.includes('Missing PAYSTACK_SECRET_KEY'))
        ? 503
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
