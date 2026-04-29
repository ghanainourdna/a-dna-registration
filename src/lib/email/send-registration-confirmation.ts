import { Resend } from 'resend';

import { REGISTRATION_TIER_LABELS } from '@/lib/registration-labels';
import type { RegistrationFormValues } from '@/lib/schemas/registration';
import { normalizeEmail, summarizeForPersistence } from '@/lib/schemas/registration';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const EVENT_TITLE = 'A-DNA Global Conference USA 2026';

/**
 * Sends a transactional email after registration is saved (payment still pending → Paystack next).
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
    const tierLabel = REGISTRATION_TIER_LABELS[values.registration_type].label;
    const first = escapeHtml(values.first_name.trim());
    const last = escapeHtml(values.last_name.trim());

    const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? '';
    const resumeUrl = appBase ? `${appBase}/register` : '';

    const fmtMoney = `$${totals.totalAmount.toFixed(2)} USD`;

    const subject =
      result.created
        ? `Registration received · ${EVENT_TITLE}`
        : `Registration updated · ${EVENT_TITLE}`;

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#1c1917;background:#f6f7f9;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;border:1px solid #e7e5e4;">
    <p style="margin:0 0 12px;font-size:15px;"><strong>${first} ${last}</strong></p>
    <p style="margin:0 0 16px;font-size:15px;">
      ${
        result.created
          ? `Thank you for registering for <strong>${escapeHtml(EVENT_TITLE)}</strong>.`
          : `We've saved your latest details for <strong>${escapeHtml(EVENT_TITLE)}</strong>.`
      }
    </p>
    <p style="margin:0 0 16px;font-size:15px;"><strong>Tier:</strong> ${escapeHtml(tierLabel)}<br/><strong>Total:</strong> ${escapeHtml(fmtMoney)}</p>
    <p style="margin:0 0 20px;font-size:15px;"><strong>Next:</strong> complete secure payment via Paystack on the registration page.</p>
    ${resumeUrl ? `<p style="margin:0 0 8px;font-size:14px;"><a href="${escapeHtml(resumeUrl)}">${escapeHtml(resumeUrl)}</a></p>` : ''}
    <p style="margin:24px 0 0;font-size:12px;color:#78716c;">Reference ID: ${escapeHtml(result.registrationId)} · ${escapeHtml(normalizeEmail(to))}</p>
  </div>
</body>
</html>`;

    const lines = [
      `${values.first_name.trim()} ${values.last_name.trim()}`,
      '',
      result.created
        ? `Thank you for registering for ${EVENT_TITLE}.`
        : `We've saved your latest registration details for ${EVENT_TITLE}.`,
      `Tier: ${tierLabel}`,
      `Total due: ${fmtMoney}`,
      '',
      `Next step: complete payment securely with Paystack on the registration page.`,
      resumeUrl ? `Return to registration: ${resumeUrl}` : '',
      '',
      `Reference ID: ${result.registrationId}`,
      `Email on file: ${normalizeEmail(to)}`,
    ];

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: normalizeEmail(to),
      subject,
      html,
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
