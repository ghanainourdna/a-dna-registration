import { Resend } from 'resend';

import { RegistrationConfirmationEmail } from '@/lib/email/templates/registration-confirmation-email';
import type { RegistrationTier } from '@/lib/pricing';
import { REGISTRATION_TIER_LABELS } from '@/lib/registration-labels';
import { normalizeEmail } from '@/lib/schemas/registration';

import type { SupabaseClient } from '@supabase/supabase-js';

export const EVENT_TITLE = 'A-DNA Ghana Conference 2027';

export type PaidRegistrationEmailRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  registration_type: RegistrationTier;
  total_amount: string | number;
  event_title?: string;
};

export function paidRegistrationEmailSubject(eventTitle = EVENT_TITLE): string {
  return `Registration confirmed · ${eventTitle}`;
}

export function buildPaidRegistrationConfirmation(row: PaidRegistrationEmailRow) {
  const eventTitle = row.event_title?.trim() || EVENT_TITLE;
  const totalUsd =
    typeof row.total_amount === 'string' ? Number.parseFloat(row.total_amount) : row.total_amount;
  const totalPaid = Number.isFinite(totalUsd) ? `$${totalUsd.toFixed(2)} USD` : String(row.total_amount);
  const tierLabel = REGISTRATION_TIER_LABELS[row.registration_type].label;
  const firstName = row.first_name.trim();
  const lastName = row.last_name.trim();
  const normalizedTo = normalizeEmail(row.email);

  const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
  const detailsUrl = appBase ? `${appBase}/register/success?registration_id=${row.id}` : '';

  const text = [
    `${firstName} ${lastName}`,
    '',
    `Thank you for registering for ${eventTitle}. Your payment has been received and your registration is confirmed.`,
    `Tier: ${tierLabel}`,
    `Amount paid: ${totalPaid}`,
    '',
    detailsUrl ? `View your registration: ${detailsUrl}` : '',
    `Reference ID: ${row.id}`,
    `Email on file: ${normalizedTo}`,
    '',
    'Tel +1 301-965-0081',
    'email : info@G-dna.org',
    'Location: Baltimore 21205',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return {
    subject: paidRegistrationEmailSubject(eventTitle),
    text,
    to: normalizedTo,
    firstName,
    lastName,
    tierLabel,
    totalPaid,
    detailsUrl: detailsUrl || undefined,
    registrationId: row.id,
  };
}

/**
 * Sends the confirmation email after Zeffy payment is marked paid.
 * No-op when `RESEND_API_KEY` is unset. Returns whether Resend accepted the message.
 */
export async function sendPaidRegistrationConfirmationEmail(
  row: PaidRegistrationEmailRow,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[email] RESEND_API_KEY is not set - paid confirmation email skipped.');
    }
    return false;
  }

  const from =
    process.env.EMAIL_FROM?.trim() ??
    'A-DNA Registration <onboarding@resend.dev>';

  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  const content = buildPaidRegistrationConfirmation(row);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: content.to,
      bcc: ['info@g-dna.org'],
      subject: content.subject,
      react: RegistrationConfirmationEmail({
        firstName: content.firstName,
        lastName: content.lastName,
        eventTitle: row.event_title?.trim() || EVENT_TITLE,
        tierLabel: content.tierLabel,
        totalPaid: content.totalPaid,
        detailsUrl: content.detailsUrl,
        registrationId: content.registrationId,
        normalizedEmail: content.to,
      }),
      text: content.text,
      tags: [{ name: 'type', value: 'registration_paid_confirmation' }],
      ...(replyTo ? { replyTo: [replyTo] } : {}),
    });

    if (error) {
      console.error('[resend] registration_paid_confirmation', error.message, error.name);
      return false;
    }
    if (process.env.NODE_ENV === 'development' && data?.id) {
      console.info('[email] sent paid registration confirmation:', data.id);
    }
    return true;
  } catch (e) {
    console.error('[email] sendPaidRegistrationConfirmationEmail', e instanceof Error ? e.message : e);
    return false;
  }
}

export const CONFIRMATION_EMAIL_CLAIM_LEASE_MS = 10 * 60 * 1000;

export type ConfirmationEmailClaimRow = {
  payment_status: 'pending' | 'paid' | 'failed';
  confirmation_email_sent_at: string | null;
  confirmation_email_claimed_at: string | null;
};

/** Mirrors the SQL claim predicate: unpaid/already-sent rows are skipped; stale leases can be reclaimed. */
export function canClaimConfirmationEmail(row: ConfirmationEmailClaimRow, now: Date = new Date()): boolean {
  if (row.payment_status !== 'paid') return false;
  if (row.confirmation_email_sent_at) return false;
  if (!row.confirmation_email_claimed_at) return true;
  return now.getTime() - Date.parse(row.confirmation_email_claimed_at) >= CONFIRMATION_EMAIL_CLAIM_LEASE_MS;
}

type ConfirmationEmailSupabase = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: SupabaseClient['from'];
};

/**
 * Claim a 10-minute lease, send, then set `confirmation_email_sent_at` only after Resend accepts.
 * If send fails, the claim is released. If the process dies mid-send, a later caller can reclaim
 * after the lease expires.
 */
export async function deliverPaidRegistrationConfirmationWithClaim(
  supabase: ConfirmationEmailSupabase,
  registrationId: string,
  sendEmail: (row: PaidRegistrationEmailRow) => Promise<boolean> = sendPaidRegistrationConfirmationEmail,
): Promise<boolean> {
  const { data: claimToken, error: claimError } = await supabase.rpc(
    'claim_registration_confirmation_email_send',
    { p_registration_id: registrationId },
  );

  if (claimError) {
    console.error('[email] claim paid confirmation', claimError.message);
    return false;
  }

  if (typeof claimToken !== 'string' || !claimToken.trim()) {
    return false;
  }

  const token = claimToken.trim();

  const { data: row, error: fetchError } = await supabase
    .from('conference_registrations')
    .select('id,first_name,last_name,email,registration_type,total_amount,payment_status,conference_id')
    .eq('id', registrationId)
    .maybeSingle();

  if (fetchError || !row || (row as { payment_status?: string }).payment_status !== 'paid') {
    const { error: clearError } = await supabase.rpc('clear_registration_confirmation_email_claim', {
      p_registration_id: registrationId,
      p_claim_token: token,
    });
    if (clearError) {
      console.error('[email] clear paid confirmation claim', clearError.message);
    }
    if (fetchError) {
      console.error('[email] load paid confirmation row', fetchError.message);
    }
    return false;
  }

  const typedRow = row as PaidRegistrationEmailRow & { conference_id?: string | null };
  let eventTitle = EVENT_TITLE;
  if (typedRow.conference_id) {
    const { data: conference } = await supabase
      .from('conferences')
      .select('title')
      .eq('id', typedRow.conference_id)
      .maybeSingle();
    if (conference?.title?.trim()) {
      eventTitle = conference.title.trim();
    }
  }

  const sent = await sendEmail({ ...typedRow, event_title: eventTitle });
  if (!sent) {
    const { error: clearError } = await supabase.rpc('clear_registration_confirmation_email_claim', {
      p_registration_id: registrationId,
      p_claim_token: token,
    });
    if (clearError) {
      console.error('[email] clear paid confirmation claim', clearError.message);
    }
    return false;
  }

  const { data: marked, error: markError } = await supabase.rpc(
    'mark_registration_confirmation_email_sent',
    { p_registration_id: registrationId, p_claim_token: token },
  );

  if (markError) {
    console.error('[email] mark paid confirmation sent', markError.message);
    return false;
  }

  return marked === true;
}

/**
 * Claim + send the post-payment confirmation once. Safe to call from webhook and verify.
 * Uses a time-limited lease so a crash between claim and Resend does not permanently suppress email.
 */
export async function sendPaidRegistrationConfirmationIfNeeded(
  supabase: SupabaseClient,
  registrationId: string,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY?.trim()) {
    return false;
  }

  return deliverPaidRegistrationConfirmationWithClaim(supabase, registrationId);
}
