import { sendPaidRegistrationConfirmationIfNeeded } from '@/lib/email/send-registration-confirmation';
import { resolveConferenceZeffyCampaignId } from '@/lib/conferences';
import {
  finalizeRegistrationPaymentForRow,
  REGISTRATION_PAYMENT_ROW_SELECT_PENDING,
  type RegistrationPaymentRow,
} from '@/lib/registration-payment-finalize';
import { trustedZeffyPaymentForPendingRegistration } from '@/lib/zeffy-client';

import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_PENDING_PAYMENT_SYNC_LIMIT = 10;
export const MAX_PENDING_PAYMENT_SYNC_LIMIT = 25;
export const PENDING_PAYMENT_RECHECK_MS = 55 * 60 * 1000;
export const PAYMENT_SYNC_CONCURRENCY = 5;
export const CONFIRMATION_RETRY_LIMIT = 25;

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
  resolvePaymentScope: typeof resolveRegistrationPaymentScope;
};

const defaultDeps: RegistrationPaymentSyncDeps = {
  matchPayment: trustedZeffyPaymentForPendingRegistration,
  finalize: finalizeRegistrationPaymentForRow,
  sendConfirmation: sendPaidRegistrationConfirmationIfNeeded,
  resolvePaymentScope: resolveRegistrationPaymentScope,
};

export async function resolveRegistrationPaymentScope(
  supabase: SupabaseClient,
  row: RegistrationPaymentRow,
): Promise<{ campaignId?: string; createdGteUnix: number }> {
  let campaignId = process.env.ZEFFY_CAMPAIGN_ID?.trim() || undefined;

  if (row.conference_id) {
    const { data, error } = await supabase
      .from('conferences')
      .select('slug,zeffy_campaign_id')
      .eq('id', row.conference_id)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    const conference = data as {
      slug?: string;
      zeffy_campaign_id?: string | null;
    } | null;
    if (!conference?.slug) {
      throw new Error('Registration conference not found');
    }
    campaignId =
      resolveConferenceZeffyCampaignId(conference.slug, conference.zeffy_campaign_id) ??
      undefined;
    if (!campaignId) {
      throw new Error(`Zeffy campaign ID is not configured for ${conference.slug}.`);
    }
  }

  const createdMs = Date.parse(row.created_at);
  const createdGteUnix = Number.isFinite(createdMs)
    ? Math.max(0, Math.floor(createdMs / 1000) - 300)
    : Math.max(0, Math.floor(Date.now() / 1000) - 24 * 60 * 60);

  return { campaignId, createdGteUnix };
}

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

  const paymentScope = await deps.resolvePaymentScope(supabase, row);

  const match = await deps.matchPayment({
    email: row.email.trim().toLowerCase(),
    expectedUsd: amountUsd,
    checkoutToken: row.checkout_correlation_reference,
    ...paymentScope,
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
  confirmationRetriesChecked: number;
  confirmationRetriesSent: number;
  confirmationRetriesFailed: number;
  errors: Array<{ registrationId: string; message: string }>;
};

export async function listPendingRegistrationsForPaymentSync(
  supabase: SupabaseClient,
  limit: number,
  now = new Date(),
): Promise<RegistrationPaymentRow[]> {
  const staleBefore = new Date(now.getTime() - PENDING_PAYMENT_RECHECK_MS).toISOString();
  const { data, error } = await supabase
    .from('conference_registrations')
    .select(REGISTRATION_PAYMENT_ROW_SELECT_PENDING)
    .eq('payment_status', 'pending')
    .or(`payment_sync_checked_at.is.null,payment_sync_checked_at.lt.${staleBefore}`)
    .order('payment_sync_checked_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RegistrationPaymentRow[];
}

async function markRegistrationsCheckedForPaymentSync(
  supabase: SupabaseClient,
  rows: RegistrationPaymentRow[],
  checkedAt: Date,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('conference_registrations')
    .update({ payment_sync_checked_at: checkedAt.toISOString() })
    .in(
      'id',
      rows.map((row) => row.id),
    );
  if (error) {
    throw new Error(error.message);
  }
}

async function listPaidRegistrationsNeedingConfirmation(
  supabase: SupabaseClient,
  limit: number,
): Promise<Array<{ id: string }>> {
  const { data, error } = await supabase
    .from('conference_registrations')
    .select('id')
    .eq('payment_status', 'paid')
    .is('confirmation_email_sent_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string }>;
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++]!;
        await work(item);
      }
    },
  );
  await Promise.all(workers);
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
  const checkedAt = new Date();
  const rows = await listPendingRegistrationsForPaymentSync(supabase, limit, checkedAt);
  await markRegistrationsCheckedForPaymentSync(supabase, rows, checkedAt);

  const summary: PendingRegistrationPaymentSyncSummary = {
    checked: rows.length,
    paid: 0,
    pending: 0,
    rejected: 0,
    confirmationRetriesChecked: 0,
    confirmationRetriesSent: 0,
    confirmationRetriesFailed: 0,
    errors: [],
  };

  await mapWithConcurrency(rows, PAYMENT_SYNC_CONCURRENCY, async (row) => {
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
  });

  const confirmationRows = await listPaidRegistrationsNeedingConfirmation(
    supabase,
    CONFIRMATION_RETRY_LIMIT,
  );
  summary.confirmationRetriesChecked = confirmationRows.length;
  await mapWithConcurrency(
    confirmationRows,
    PAYMENT_SYNC_CONCURRENCY,
    async ({ id }) => {
      try {
        if (await deps.sendConfirmation(supabase, id)) {
          summary.confirmationRetriesSent += 1;
        } else {
          summary.confirmationRetriesFailed += 1;
          summary.errors.push({
            registrationId: id,
            message: 'Confirmation email was not sent.',
          });
        }
      } catch (error) {
        summary.errors.push({
          registrationId: id,
          message: error instanceof Error ? error.message : 'Confirmation retry failed',
        });
      }
    },
  );

  return summary;
}
