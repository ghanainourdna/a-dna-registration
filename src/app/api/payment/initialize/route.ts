import { centsFromUsd, type OccupancyType, type RegistrationTier, type RoomTypeCode } from '@/lib/pricing';
import { assertPricingMatches } from '@/lib/schemas/registration';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { resolveZeffyCheckoutBaseUrl } from '@/lib/zeffy-checkout-urls';

import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

type DbRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  payment_status: 'pending' | 'paid' | 'failed';
  total_amount: string | number;
  registration_type: RegistrationTier;
  is_student: boolean;
  needs_housing: boolean;
  room_type: RoomTypeCode | null;
  occupancy_type: OccupancyType | null;
  registration_amount: string | number;
  housing_amount: string | number;
  conference_id?: string | null;
};

export async function POST(req: NextRequest) {
  let body: { registrationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.registrationId) {
    return NextResponse.json({ error: 'registrationId is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const envFallback = process.env.NEXT_PUBLIC_ZEFFY_CHECKOUT_URL?.trim();
    if (!envFallback) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_ZEFFY_CHECKOUT_URL is not configured' }, { status: 503 });
    }

    const result = await prepareCheckout(body.registrationId, supabase, envFallback);
    let appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
    if (!appUrl && process.env.VERCEL_URL) {
      appUrl = `https://${process.env.VERCEL_URL}`;
    }

    const redirect = new URL(result.checkoutBaseUrl);
    redirect.searchParams.set('registration_id', result.registrationId);
    redirect.searchParams.set('checkout_reference', result.correlationToken.slice(0, 120));

    const { error: refError } = await supabase
      .from('conference_registrations')
      .update({ checkout_correlation_reference: result.correlationToken })
      .eq('id', result.registrationId);

    if (refError) {
      return NextResponse.json({ error: 'Could not persist checkout correlation' }, { status: 500 });
    }

    /** Documented UX: optionally keep `success_return` local for custom Zeffy redirect requests */
    if (appUrl) {
      redirect.searchParams.set('success_return_hint', `${appUrl}/register/success`);
    }

    return NextResponse.json({
      authorizationUrl: redirect.toString(),
      reference: result.correlationToken,
      registrationId: result.registrationId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unable to initialize payment';
    const status =
      typeof msg === 'string' &&
      (msg.includes('Missing NEXT_PUBLIC_ZEFFY_CHECKOUT_URL') ||
        msg.includes('Missing NEXT_PUBLIC_SUPABASE_URL') ||
        msg.includes('Missing SUPABASE_SERVICE_ROLE_KEY'))
        ? 503
        : 400;

    return NextResponse.json({ error: msg }, { status });
  }
}

async function prepareCheckout(
  registrationId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fallbackCampaignUrl: string,
) {
  const { data, error } = await supabase
    .from('conference_registrations')
    .select(
      'id,email,first_name,last_name,phone,payment_status,total_amount,registration_type,is_student,needs_housing,room_type,occupancy_type,registration_amount,housing_amount,conference_id',
    )
    .eq('id', registrationId)
    .single();

  if (error || !data) {
    throw new Error('Registration not found');
  }

  const row = data as DbRow;

  if (row.payment_status === 'paid') {
    throw new Error('This registration is already paid.');
  }

  if (!assertPricingMatches(row)) {
    throw new Error('Stored totals do not match current pricing.');
  }

  const totalUsd =
    typeof row.total_amount === 'string' ? Number.parseFloat(row.total_amount) : row.total_amount;

  if (Number.isNaN(totalUsd) || totalUsd <= 0 || centsFromUsd(totalUsd) <= 0) {
    throw new Error('Invalid total amount.');
  }

  const correlationToken = `ADNA26-${registrationId}-${Date.now()}`.slice(0, 200);

  let campaignUrl = fallbackCampaignUrl;
  if (row.conference_id) {
    const { data: conference } = await supabase
      .from('conferences')
      .select('zeffy_checkout_url')
      .eq('id', row.conference_id)
      .maybeSingle();
    const conferenceUrl = conference?.zeffy_checkout_url?.trim();
    if (conferenceUrl) {
      campaignUrl = conferenceUrl;
    }
  }

  const checkoutBaseUrl = resolveZeffyCheckoutBaseUrl(row, campaignUrl);

  return {
    registrationId,
    correlationToken,
    email: row.email.trim().toLowerCase(),
    totalUsd,
    checkoutBaseUrl,
  };
}
