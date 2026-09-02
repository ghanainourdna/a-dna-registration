import { requireConferenceBySlug } from '@/lib/conferences';
import { DuplicateRegistrationError, InvalidConferenceError, InvalidCountryError } from '@/lib/errors';
import type { RegistrationTier } from '@/lib/pricing';
import type { RegistrationFormValues } from '@/lib/schemas/registration';
import { registrationFormSchema, summarizeForPersistence } from '@/lib/schemas/registration';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

type RegistrationRow = {
  id: string;
  payment_status: 'pending' | 'paid' | 'failed';
};

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = registrationFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 400 });
  }

  const conferenceSlug =
    body && typeof body === 'object' && 'conference_slug' in body && typeof body.conference_slug === 'string'
      ? body.conference_slug
      : undefined;

  try {
    const result = await saveRegistration(parsed.data, conferenceSlug);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (e: unknown) {
    if (e instanceof InvalidCountryError || e instanceof InvalidConferenceError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof DuplicateRegistrationError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

async function saveRegistration(values: RegistrationFormValues, conferenceSlug?: string) {
  const { email, payload } = summarizeForPersistence(values);

  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    throw new Error('Registration service is unavailable. Missing Supabase environment variables.');
  }

  const { data: countryRow } = await supabase.from('countries').select('code').eq('code', values.country).maybeSingle();

  if (!countryRow) {
    throw new InvalidCountryError();
  }

  const { id: conferenceId } = await requireConferenceBySlug(supabase, conferenceSlug);

  const { data: existing } = await supabase
    .from('conference_registrations')
    .select('id,payment_status')
    .eq('email', email)
    .eq('conference_id', conferenceId)
    .maybeSingle();

  const row = existing as RegistrationRow | null;

  if (row?.payment_status === 'paid') {
    throw new DuplicateRegistrationError();
  }

  const record = {
    first_name: payload.first_name,
    middle_initial: payload.middle_initial,
    last_name: payload.last_name,
    email,
    phone: payload.phone,
    professional_role: payload.professional_role,
    highest_degree: payload.highest_degree,
    institution: payload.institution,
    department: payload.department,
    is_student: payload.is_student,
    country: payload.country,
    state_region: payload.state_region,
    city: payload.city,
    dietary_requirements: payload.dietary_requirements,
    accessibility_needs: payload.accessibility_needs,
    additional_notes: payload.additional_notes,
    needs_housing: payload.needs_housing,
    room_type: payload.room_type,
    occupancy_type: payload.occupancy_type,
    heard_about_us: payload.heard_about_us,
    instagram_handle: payload.instagram_handle,
    x_handle: payload.x_handle,
    linkedin_url: payload.linkedin_url,
    facebook_handle: payload.facebook_handle,
    other_social: payload.other_social,
    registration_type: payload.registration_type as RegistrationTier,
    registration_amount: payload.registration_amount,
    housing_amount: payload.housing_amount,
    total_amount: payload.total_amount,
    payment_status: 'pending' as const,
    checkout_correlation_reference: null as string | null,
    conference_id: conferenceId,
  };

  if (row) {
    const { data: updated, error } = await supabase
      .from('conference_registrations')
      .update(record)
      .eq('id', row.id)
      .select('id')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const fresh = await fetchRow(supabase, updated.id);
    if (fresh.payment_status === 'paid') {
      throw new DuplicateRegistrationError();
    }

    return { registrationId: updated.id, created: false };
  }

  const { data: inserted, error } = await supabase.from('conference_registrations').insert(record).select('id').single();

  if (error) {
    if (error.code === '23505') {
      return saveRegistration(values, conferenceSlug);
    }
    throw new Error(error.message);
  }

  return { registrationId: inserted.id, created: true };
}

async function fetchRow(supabase: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const { data, error } = await supabase.from('conference_registrations').select('id,payment_status').eq('id', id).single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Registration could not be read back');
  }
  return data as RegistrationRow;
}
