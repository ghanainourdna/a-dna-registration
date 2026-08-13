import { Resend } from 'resend';

import { RegistrationConfirmationEmail } from '@/lib/email/templates/registration-confirmation-email';
import type { RegistrationTier } from '@/lib/pricing';
import { REGISTRATION_TIER_LABELS } from '@/lib/registration-labels';
import { normalizeEmail } from '@/lib/schemas/registration';

import type { SupabaseClient } from '@supabase/supabase-js';

export const EVENT_TITLE = 'A-DNA Global Conference USA 2026';

export type PaidRegistrationEmailRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  registration_type: RegistrationTier;
  total_amount: string | number;
};

export function paidRegistrationEmailSubject(): string {
  return `Registration confirmed · ${EVENT_TITLE}`;
}

export function buildPaidRegistrationConfirmation(row: PaidRegistrationEmailRow) {
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
    `Thank you for registering for ${EVENT_TITLE}. Your payment has been received and your registration is confirmed.`,
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
    subject: paidRegistrationEmailSubject(),
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
      console.warn('[email] RESEND_API_KEY is not set — paid confirmation email skipped.');
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
        eventTitle: EVENT_TITLE,
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

/**
 * Claim + send the post-payment confirmation once. Safe to call from webhook and verify.
 * If send fails, the claim is cleared so a later path can retry.
 */
export async function sendPaidRegistrationConfirmationIfNeeded(
  supabase: SupabaseClient,
  registrationId: string,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY?.trim()) {
    return false;
  }

  const claimedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('conference_registrations')
    .update({ confirmation_email_sent_at: claimedAt })
    .eq('id', registrationId)
    .eq('payment_status', 'paid')
    .is('confirmation_email_sent_at', null)
    .select('id,first_name,last_name,email,registration_type,total_amount')
    .maybeSingle();

  if (error) {
    console.error('[email] claim paid confirmation', error.message);
    return false;
  }
  if (!data) {
    return false;
  }

  const sent = await sendPaidRegistrationConfirmationEmail(data as PaidRegistrationEmailRow);
  if (!sent) {
    const { error: clearError } = await supabase
      .from('conference_registrations')
      .update({ confirmation_email_sent_at: null })
      .eq('id', registrationId)
      .eq('confirmation_email_sent_at', claimedAt);
    if (clearError) {
      console.error('[email] clear paid confirmation claim', clearError.message);
    }
  }
  return sent;
}
