import { Resend } from 'resend';

import { RegistrationConfirmationEmail } from '@/lib/email/templates/registration-confirmation-email';
import { REGISTRATION_TIER_LABELS } from '@/lib/registration-labels';
import type { RegistrationFormValues } from '@/lib/schemas/registration';
import { normalizeEmail, summarizeForPersistence } from '@/lib/schemas/registration';

const EVENT_TITLE = 'A-DNA Global Conference USA 2026';

/**
 * Sends a transactional email after registration is saved (payment still pending → hosted Zeffy checkout next).
 * No-op when `RESEND_API_KEY` is unset. Logs errors without throwing so registration persists.
 */
export async function sendRegistrationConfirmationEmail(
  values: RegistrationFormValues,
  result: { registrationId: string; created: boolean },
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[email] RESEND_API_KEY is not set — registration confirmation email skipped.');
    }
    return;
  }

  const from =
    process.env.EMAIL_FROM?.trim() ??
    /* Resend sandbox: only verified recipient on free tier; swap for `Name <noreply@yourdomain.com>` after domain verify */
    'A-DNA Registration <onboarding@resend.dev>';

  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  try {
    const { email: to, totals } = summarizeForPersistence(values);
    const normalizedTo = normalizeEmail(to);
    const tierLabel = REGISTRATION_TIER_LABELS[values.registration_type].label;
    const first = values.first_name.trim();
    const last = values.last_name.trim();

    const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
    const resumeUrl = appBase ? `${appBase}/register` : '';

    const fmtMoney = `$${totals.totalAmount.toFixed(2)} USD`;

    const subject =
      result.created
        ? `Registration received · ${EVENT_TITLE}`
        : `Registration updated · ${EVENT_TITLE}`;

    const lines = [
      `${values.first_name.trim()} ${values.last_name.trim()}`,
      '',
      result.created
        ? `Thank you for registering for ${EVENT_TITLE}.`
        : `We've saved your latest registration details for ${EVENT_TITLE}.`,
      `Tier: ${tierLabel}`,
      `Total due: ${fmtMoney}`,
      '',
      `Next step: complete payment securely via Zeffy from the registration page.`,
      resumeUrl ? `Return to registration: ${resumeUrl}` : '',
      '',
      `Reference ID: ${result.registrationId}`,
      `Email on file: ${normalizedTo}`,
      '',
      'Tel +1 301-965-0081',
      'email : info@G-dna.org',
      'Location: Baltimore 21205',
    ];

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: normalizedTo,
      subject,
      react: RegistrationConfirmationEmail({
        firstName: first,
        lastName: last,
        eventTitle: EVENT_TITLE,
        tierLabel,
        totalDue: fmtMoney,
        created: result.created,
        resumeUrl: resumeUrl || undefined,
        registrationId: result.registrationId,
        normalizedEmail: normalizedTo,
      }),
      text: lines.join('\n'),
      tags: [{ name: 'type', value: 'registration_confirmation' }],
      ...(replyTo ? { replyTo: [replyTo] } : {}),
    });

    if (error) {
      console.error('[resend] registration_confirmation', error.message, error.name);
      return;
    }
    if (process.env.NODE_ENV === 'development' && data?.id) {
      console.info('[email] sent registration confirmation:', data.id);
    }
  } catch (e) {
    console.error('[email] sendRegistrationConfirmationEmail', e instanceof Error ? e.message : e);
  }
}
