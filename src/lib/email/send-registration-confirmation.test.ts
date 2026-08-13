import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildPaidRegistrationConfirmation,
  paidRegistrationEmailSubject,
  sendPaidRegistrationConfirmationIfNeeded,
} from '@/lib/email/send-registration-confirmation';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('paid registration confirmation email', () => {
  it('confirms payment instead of asking the user to pay', () => {
    const content = buildPaidRegistrationConfirmation({
      id: 'reg-123',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      registration_type: 'virtual',
      total_amount: 100,
    });

    expect(content.subject).toBe(paidRegistrationEmailSubject());
    expect(content.subject).toMatch(/confirmed/i);
    expect(content.text).toMatch(/payment has been received/i);
    expect(content.text).toMatch(/registration is confirmed/i);
    expect(content.text).not.toMatch(/complete payment/i);
    expect(content.text).not.toMatch(/Zeffy from the registration page/i);
    expect(content.totalPaid).toBe('$100.00 USD');
    expect(content.tierLabel).toBe('$100 — Virtual');
  });

  it('includes a success-page link when NEXT_PUBLIC_APP_URL is set', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://register.example.org/');

    const content = buildPaidRegistrationConfirmation({
      id: 'reg-456',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
      registration_type: 'conference_only',
      total_amount: '200.00',
    });

    expect(content.detailsUrl).toBe(
      'https://register.example.org/register/success?registration_id=reg-456',
    );
    expect(content.text).toContain(content.detailsUrl);
  });

  it('does not claim a send when RESEND_API_KEY is unset', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const from = vi.fn();
    const supabase = { from };

    await expect(
      sendPaidRegistrationConfirmationIfNeeded(supabase as never, 'reg-123'),
    ).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});
