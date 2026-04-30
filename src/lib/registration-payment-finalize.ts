import { centsFromUsd } from '@/lib/pricing';
import type { OccupancyType, RegistrationTier, RoomTypeCode } from '@/lib/pricing';
import { assertPricingMatches } from '@/lib/schemas/registration';

import type { SupabaseClient } from '@supabase/supabase-js';

export type RegistrationPaymentRow = {
  id: string;
  email?: string;
  registration_type: RegistrationTier;
  needs_housing: boolean;
  room_type: RoomTypeCode | null;
  occupancy_type: OccupancyType | null;
  registration_amount: string | number;
  housing_amount: string | number;
  total_amount: string | number;
  payment_status: 'pending' | 'paid' | 'failed';
  checkout_correlation_reference: string | null;
};

export const REGISTRATION_PAYMENT_ROW_SELECT_PENDING =
  'id,registration_type,needs_housing,room_type,occupancy_type,payment_status,total_amount,checkout_correlation_reference,registration_amount,housing_amount,email';

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function registrationUuidGuessFromDeepScan(root: unknown): string | null {
  const hits: string[] = [];
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === 'string') {
      const t = v.trim();
      if (UUID_RX.test(t)) hits.push(t);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v === 'object') {
      for (const x of Object.values(v)) walk(x);
    }
  };
  walk(root);
  return hits[0] ?? null;
}

function expectedCentsForRow(row: RegistrationPaymentRow): number | null {
  const totalUsd = typeof row.total_amount === 'string' ? Number.parseFloat(row.total_amount) : row.total_amount;
  if (Number.isNaN(totalUsd)) return null;
  return centsFromUsd(totalUsd);
}

export async function fetchRegistrationPaymentRowForFinalize(
  supabase: SupabaseClient,
  id: string,
): Promise<RegistrationPaymentRow | null> {
  const { data } = await supabase
    .from('conference_registrations')
    .select(REGISTRATION_PAYMENT_ROW_SELECT_PENDING)
    .eq('id', id)
    .maybeSingle();

  return (data as RegistrationPaymentRow | null) ?? null;
}

/**
 * Locate row by correlation token persisted when the registrant begins checkout (`ADNA26-…`).
 */
export async function findRegistrationByCorrelationToken(
  supabase: SupabaseClient,
  token: string,
): Promise<RegistrationPaymentRow | null> {
  const t = token.trim();
  if (!t) return null;
  const { data } = await supabase
    .from('conference_registrations')
    .select(REGISTRATION_PAYMENT_ROW_SELECT_PENDING)
    .eq('checkout_correlation_reference', t)
    .maybeSingle();

  return (data as RegistrationPaymentRow | null) ?? null;
}

export async function listPendingRegistrationsByEmail(supabase: SupabaseClient, emailLower: string) {
  const { data } = await supabase
    .from('conference_registrations')
    .select(REGISTRATION_PAYMENT_ROW_SELECT_PENDING)
    .eq('email', emailLower)
    .eq('payment_status', 'pending');

  return (((data ?? []) as RegistrationPaymentRow[]) ?? []).filter((r) => expectedCentsForRow(r) != null);
}

function filterMatchingAmount(rows: RegistrationPaymentRow[], verifiedAmountCents: number): RegistrationPaymentRow[] {
  const want = Math.round(verifiedAmountCents);
  return rows.filter((r) => {
    const ec = expectedCentsForRow(r);
    return ec != null && Math.round(ec) === want;
  });
}

/** Correlate webhook payment → pending registration safely (prefer UUID, tie-break checkout token substring). */
export async function resolveRegistrationRowForZeffyWebhook(opts: {
  supabase: SupabaseClient;
  paymentObject: Record<string, unknown>;
  payerEmailLower: string;
  envelope: unknown;
  verifiedAmountCents: number;
}): Promise<
  | { row: RegistrationPaymentRow }
  | { rejectReason: string }
  | { ambiguous: true }
> {
  const { supabase, paymentObject, payerEmailLower, envelope, verifiedAmountCents } = opts;
  const blob = JSON.stringify({ envelope, paymentObject });

  const uuidGuess = registrationUuidGuessFromDeepScan(envelope ?? paymentObject);
  if (uuidGuess) {
    const row = await fetchRegistrationPaymentRowForFinalize(supabase, uuidGuess);
    const ecRow = row && expectedCentsForRow(row);
    const amtOk =
      row?.payment_status === 'pending' && ecRow != null && Math.round(ecRow) === Math.round(verifiedAmountCents);
    const emailOk =
      !row?.email ||
      payerEmailLower.trim().length === 0 ||
      row.email.trim().toLowerCase() === payerEmailLower.trim().toLowerCase();
    if (row && amtOk && emailOk) {
      return { row };
    }
    if (row && amtOk && !emailOk) {
      return { rejectReason: 'email_uuid_mismatch' };
    }
  }

  const emailTrim = payerEmailLower.trim().toLowerCase();
  if (!emailTrim) {
    return { rejectReason: 'missing_buyer_email' };
  }

  const pendingForEmail = await listPendingRegistrationsByEmail(supabase, emailTrim);
  const candidates = filterMatchingAmount(pendingForEmail, verifiedAmountCents);

  if (candidates.length === 1) {
    return { row: candidates[0]! };
  }

  /** Multiple pending registrations for the same email + amount edge case */
  if (candidates.length > 1) {
    const hinted = candidates.filter((r) => {
      const t = r.checkout_correlation_reference?.trim();
      return !!t && blob.includes(t);
    });

    if (hinted.length === 1) {
      return { row: hinted[0]! };
    }
    return { ambiguous: true };
  }

  return { rejectReason: 'not_found_pending_registration' };
}

/**
 * After verifying `verifiedAmountCents` against Stripe/Zeffy, persist `paid` and swap correlation ref for provider payment id.
 */
export async function finalizeRegistrationPaymentForRow(
  supabase: SupabaseClient,
  row: RegistrationPaymentRow,
  externalPaymentId: string,
  verifiedAmountCents: number,
): Promise<
  | { outcome: 'paid'; registrationId: string }
  | { outcome: 'already_paid'; registrationId: string }
  | { outcome: 'rejected'; reason: 'pricing_mismatch' | 'invalid_total' | 'amount_mismatch' }
  | { outcome: 'db_error'; message: string }
> {
  const externalId = externalPaymentId.trim();

  if (!assertPricingMatches(row)) {
    await supabase.from('conference_registrations').update({ payment_status: 'failed' }).eq('id', row.id);
    return { outcome: 'rejected', reason: 'pricing_mismatch' };
  }

  const expected = expectedCentsForRow(row);
  if (expected == null) {
    await supabase.from('conference_registrations').update({ payment_status: 'failed' }).eq('id', row.id);
    return { outcome: 'rejected', reason: 'invalid_total' };
  }

  if (Math.round(expected) !== Math.round(verifiedAmountCents)) {
    await supabase.from('conference_registrations').update({ payment_status: 'failed' }).eq('id', row.id);
    return { outcome: 'rejected', reason: 'amount_mismatch' };
  }

  if (row.payment_status === 'paid') {
    return { outcome: 'already_paid', registrationId: row.id };
  }

  const { error: updError } = await supabase
    .from('conference_registrations')
    .update({
      payment_status: 'paid',
      checkout_correlation_reference: externalId,
    })
    .eq('id', row.id);

  if (updError) {
    return { outcome: 'db_error', message: updError.message };
  }

  return { outcome: 'paid', registrationId: row.id };
}
