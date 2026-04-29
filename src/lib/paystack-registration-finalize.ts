import { centsFromUsd } from '@/lib/pricing';
import type { OccupancyType, RegistrationTier, RoomTypeCode } from '@/lib/pricing';
import { assertPricingMatches } from '@/lib/schemas/registration';

import type { SupabaseClient } from '@supabase/supabase-js';

export type RegistrationPaystackRow = {
  id: string;
  registration_type: RegistrationTier;
  needs_housing: boolean;
  room_type: RoomTypeCode | null;
  occupancy_type: OccupancyType | null;
  registration_amount: string | number;
  housing_amount: string | number;
  total_amount: string | number;
  payment_status: 'pending' | 'paid' | 'failed';
  paystack_reference: string | null;
};

const ROW_SELECT =
  'id,registration_type,needs_housing,room_type,occupancy_type,payment_status,total_amount,paystack_reference,registration_amount,housing_amount';

/**
 * Locate registration row by checkout reference saved on row, then by Paystack metadata registration_id.
 */
export async function findRegistrationForPaystack(
  supabase: SupabaseClient,
  reference: string,
  registrationIdFromMeta?: string,
): Promise<
  | { row: RegistrationPaystackRow; metaMismatch: false }
  | { row: RegistrationPaystackRow; metaMismatch: true }
  | { row: null; metaMismatch: false }
> {
  const metaId = registrationIdFromMeta?.trim() ?? '';

  const { data: byRef } = await supabase
    .from('conference_registrations')
    .select(ROW_SELECT)
    .eq('paystack_reference', reference.trim())
    .maybeSingle();

  const { data: byId } =
    metaId && !byRef
      ? await supabase.from('conference_registrations').select(ROW_SELECT).eq('id', metaId).maybeSingle()
      : { data: null };

  const picked = (byRef ?? byId) as RegistrationPaystackRow | null;

  if (!picked) {
    return { row: null, metaMismatch: false };
  }

  if (metaId && metaId !== picked.id) {
    return { row: picked, metaMismatch: true };
  }

  return { row: picked, metaMismatch: false };
}

/**
 * Validates amount + pricing against stored registration and marks paid when trusted
 * inputs match (used by `/api/paystack/verify` and Paystack webhook after signature verification).
 */
export async function finalizeRegistrationPaymentFromTrustedPaystackCharge(
  supabase: SupabaseClient,
  opts: {
    reference: string;
    amountCents: number;
    /** From Paystack metadata */
    registrationIdFromMeta?: string;
    /** When set (e.g. from {@link findRegistrationForPaystack}), skips duplicate select */
    cachedRow?: RegistrationPaystackRow;
  },
): Promise<
  | { outcome: 'paid'; registrationId: string }
  | { outcome: 'already_paid'; registrationId: string }
  | {
      outcome: 'rejected';
      reason:
        | 'not_found'
        | 'metadata_mismatch'
        | 'pricing_mismatch'
        | 'amount_mismatch'
        | 'invalid_total';
      registrationId?: string;
    }
  | { outcome: 'db_error'; message: string }
> {
  const reference = opts.reference.trim();
  const metaId = opts.registrationIdFromMeta?.trim() ?? '';

  let picked: RegistrationPaystackRow | null = opts.cachedRow ?? null;
  if (!picked) {
    const found = await findRegistrationForPaystack(supabase, reference, opts.registrationIdFromMeta);
    if (!found.row) {
      return { outcome: 'rejected', reason: 'not_found' };
    }
    if (found.metaMismatch) {
      return { outcome: 'rejected', reason: 'metadata_mismatch', registrationId: found.row.id };
    }
    picked = found.row;
  } else if (metaId && metaId !== picked.id) {
    return { outcome: 'rejected', reason: 'metadata_mismatch', registrationId: picked.id };
  }

  if (!assertPricingMatches(picked)) {
    await supabase.from('conference_registrations').update({ payment_status: 'failed' }).eq('id', picked.id);
    return { outcome: 'rejected', reason: 'pricing_mismatch', registrationId: picked.id };
  }

  const totalUsd = typeof picked.total_amount === 'string' ? Number.parseFloat(picked.total_amount) : picked.total_amount;
  if (Number.isNaN(totalUsd)) {
    await supabase.from('conference_registrations').update({ payment_status: 'failed' }).eq('id', picked.id);
    return { outcome: 'rejected', reason: 'invalid_total', registrationId: picked.id };
  }

  const expectedCents = centsFromUsd(totalUsd);
  if (Math.round(opts.amountCents) !== Math.round(expectedCents)) {
    await supabase.from('conference_registrations').update({ payment_status: 'failed' }).eq('id', picked.id);
    return { outcome: 'rejected', reason: 'amount_mismatch', registrationId: picked.id };
  }

  if (picked.payment_status === 'paid') {
    return { outcome: 'already_paid', registrationId: picked.id };
  }

  const { error: updError } = await supabase
    .from('conference_registrations')
    .update({
      payment_status: 'paid',
      paystack_reference: reference,
    })
    .eq('id', picked.id);

  if (updError) {
    return { outcome: 'db_error', message: updError.message };
  }

  return { outcome: 'paid', registrationId: picked.id };
}
