import { sendPaidRegistrationConfirmationIfNeeded } from '@/lib/email/send-registration-confirmation';
import {
  finalizeRegistrationPaymentForRow,
  REGISTRATION_PAYMENT_ROW_SELECT_PENDING,
  type RegistrationPaymentRow,
} from '@/lib/registration-payment-finalize';
import { trustedZeffyPaymentForPendingRegistration } from '@/lib/zeffy-client';

import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_PENDING_PAYMENT_SYNC_LIMIT = 50;
export const MAX_PENDING_PAYMENT_SYNC_LIMIT = 100;

export function clampPendingPaymentSyncLimit(raw: unknown): number {
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number.parseInt(raw, 10);
    return clampPendingPaymentSyncLimit(n);
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_PENDING_PAYMENT_SYNC_LIMIT;
  }
  return Math.max(1, Math.min(Math.trunc(raw), MAX_PENDING_PAYMENT_SYNC_LIMIT));
}

function amountUsdForRow(row: RegistrationPaymentRow): number {
  return typeof row.total_amount === 'string' ? Number.parseFloat(row.total_amount) : row.total_amount;
}

export type RegistrationPaymentSyncDeps = {
  matchPayment: typeof trustedZeffyPaymentForPendingRegistration;
  finalize: typeof finalizeRegistrationPaymentForRow;
  sendConfirmation: typeof sendPaidRegistrationConfirmationIfNeeded;
};

const defaultDeps: RegistrationPaymentSyncDeps = {
  matchPayment: trustedZeffyPaymentForPendingRegistration,
  finalize: finalizeRegistrationPaymentForRow,
  sendConfirmation: sendPaidRegistrationConfirmationIfNeeded,
};

export type OneRegistrationPaymentSyncResult =
  | {
      outcome: 'paid';
      registrationId: string;
      amountUsd: number;
      providerPaymentId?: string;
      alreadyPaid: boolean;
    }
  | { outcome: 'pending'; registrationId: string; amountUsd: number; reason: string }
  | { outcome: 'rejected'; registrationId: string; reason: string }
  | { outcome: 'error'; message: string; httpStatus: 400 | 500 | 503 };

export async function syncOneRegistrationPaymentFromZeffy(
  supabase: SupabaseClient,
  row: RegistrationPaymentRow,
  deps: RegistrationPaymentSyncDeps = defaultDeps,
): Promise<OneRegistrationPaymentSyncResult> {
  const amountUsd = amountUsdForRow(row);

  if (row.payment_status === 'paid') {
    await deps.sendConfirmation(supabase, row.id);
    return {
      outcome: 'paid',
      registrationId: row.id,
      amountUsd,
      alreadyPaid: true,
    };
  }

  if (!row.email) {
    return { outcome: 'error', message: 'Registration email unavailable.', httpStatus: 500 };
  }

  const match = await deps.matchPayment({
    email: row.email.trim().toLowerCase(),
    expectedUsd: amountUsd,
    checkoutToken: row.checkout_correlation_reference,
  });

  if ('error' in match) {
    return { outcome: 'error', message: match.error, httpStatus: 503 };
  }

  if ('notFoundReason' in match) {
    return {
      outcome: 'pending',
      registrationId: row.id,
      amountUsd,
      reason: match.notFoundReason,
    };
  }

  const fin = await deps.finalize(supabase, row, match.paymentId, match.amountCents);

  if (fin.outcome === 'rejected') {
    return { outcome: 'rejected', registrationId: row.id, reason: fin.reason };
  }

  if (fin.outcome === 'db_error') {
    return { outcome: 'error', message: fin.message, httpStatus: 500 };
  }

  await deps.sendConfirmation(supabase, fin.registrationId);

  return {
    outcome: 'paid',
    registrationId: fin.registrationId,
    amountUsd,
    providerPaymentId: match.paymentId,
    alreadyPaid: fin.outcome === 'already_paid',
  };
}

export type PendingRegistrationPaymentSyncSummary = {
  checked: number;
  paid: number;
  pending: number;
  rejected: number;
  errors: Array<{ registrationId: string; message: string }>;
};

export async function listPendingRegistrationsForPaymentSync(
  supabase: SupabaseClient,
  limit: number,
): Promise<RegistrationPaymentRow[]> {
  const { data, error } = await supabase
    .from('conference_registrations')
    .select(REGISTRATION_PAYMENT_ROW_SELECT_PENDING)
    .eq('payment_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RegistrationPaymentRow[];
}

/**
 * Pull succeeded Zeffy payments for pending conference registrations and mark matching rows paid.
 * Safe to run from cron or a manual authenticated request.
 */
export async function syncPendingRegistrationPaymentsFromZeffy(
  supabase: SupabaseClient,
  opts: { limit?: unknown } = {},
  deps: RegistrationPaymentSyncDeps = defaultDeps,
): Promise<PendingRegistrationPaymentSyncSummary> {
  const limit = clampPendingPaymentSyncLimit(opts.limit);
  const rows = await listPendingRegistrationsForPaymentSync(supabase, limit);

  const summary: PendingRegistrationPaymentSyncSummary = {
    checked: rows.length,
    paid: 0,
    pending: 0,
    rejected: 0,
    errors: [],
  };

  for (const row of rows) {
    try {
      const result = await syncOneRegistrationPaymentFromZeffy(supabase, row, deps);
      if (result.outcome === 'paid') {
        summary.paid += 1;
      } else if (result.outcome === 'pending') {
        summary.pending += 1;
      } else if (result.outcome === 'rejected') {
        summary.rejected += 1;
      } else {
        summary.errors.push({ registrationId: row.id, message: result.message });
      }
    } catch (e) {
      summary.errors.push({
        registrationId: row.id,
        message: e instanceof Error ? e.message : 'Unexpected sync error',
      });
    }
  }

  return summary;
}
