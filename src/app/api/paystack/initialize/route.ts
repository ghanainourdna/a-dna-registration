import { centsFromUsd } from '@/lib/pricing';
import type { OccupancyType, RegistrationTier, RoomTypeCode } from '@/lib/pricing';
import { assertPricingMatches } from '@/lib/schemas/registration';
import { paystackInitializeTransaction } from '@/lib/paystack';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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
  needs_housing: boolean;
  room_type: RoomTypeCode | null;
  occupancy_type: OccupancyType | null;
  registration_amount: string | number;
  housing_amount: string | number;
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
    const result = await startPayment(body.registrationId, supabase);

    let appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
    if (!appUrl && process.env.VERCEL_URL) {
      appUrl = `https://${process.env.VERCEL_URL}`;
    }
    if (!appUrl) {
      appUrl = 'http://localhost:3000';
    }

    const init = await paystackInitializeTransaction({
      email: result.email,
      amountUsd: result.totalUsd,
      reference: result.reference,
      fullName: result.fullName,
      phone: result.phone,
      callbackUrl: `${appUrl}/register/success`,
      metadata: {
        registration_id: result.registrationId,
      },
    });

    const { error: refError } = await supabase
      .from('conference_registrations')
      .update({ paystack_reference: result.reference })
      .eq('id', result.registrationId);

    if (refError) {
      return NextResponse.json({ error: 'Could not persist payment reference' }, { status: 500 });
    }

    return NextResponse.json({
      authorizationUrl: init.authorization_url,
      reference: init.reference ?? result.reference,
      accessCode: init.access_code,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unable to initialize payment';
    const status =
      typeof msg === 'string' &&
      (
        msg.includes('Missing PAYSTACK_SECRET_KEY') ||
          msg.includes('Missing NEXT_PUBLIC_SUPABASE_URL') ||
          msg.includes('Missing SUPABASE_SERVICE_ROLE_KEY'))
        ? 503
        : 400;

    return NextResponse.json({ error: msg }, { status });
  }
}

async function startPayment(registrationId: string, supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from('conference_registrations')
    .select(
      'id,email,first_name,last_name,phone,payment_status,total_amount,registration_type,needs_housing,room_type,occupancy_type,registration_amount,housing_amount',
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

  const totalUsd = typeof row.total_amount === 'string' ? Number.parseFloat(row.total_amount) : row.total_amount;
  if (Number.isNaN(totalUsd) || totalUsd <= 0 || centsFromUsd(totalUsd) <= 0) {
    throw new Error('Invalid total amount.');
  }

  const reference = `ADNA26-${registrationId}-${Date.now()}`.slice(0, 60);

  return {
    registrationId,
    reference,
    email: row.email.trim().toLowerCase(),
    phone: row.phone,
    totalUsd,
    fullName: `${row.first_name} ${row.last_name}`.trim(),
  };
}
