import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';

import { RegistrationConfirmationEmail } from '@/lib/email/templates/registration-confirmation-email';

describe('RegistrationConfirmationEmail', () => {
  it('renders confirmation copy with optional success link', async () => {
    const html = await render(
      RegistrationConfirmationEmail({
        firstName: 'Ada',
        lastName: 'Lovelace',
        eventTitle: 'A-DNA Ghana Conference 2027',
        tierLabel: 'GHS 1,500 - African Nurses and Midwives',
        totalPaid: 'GHS 1,500.00',
        detailsUrl: 'https://register.example.org/register/success?registration_id=abc',
        registrationId: 'abc',
        normalizedEmail: 'ada@example.com',
      }),
    );

    expect(html).toMatch(/Ada/);
    expect(html).toMatch(/Lovelace/);
    expect(html).toMatch(/payment has been received/i);
    expect(html).toMatch(/register\.example\.org/);
    expect(html).toMatch(/301-965-0081/);
  });

  it('omits the link block when detailsUrl is unset', async () => {
    const html = await render(
      RegistrationConfirmationEmail({
        firstName: 'Ada',
        lastName: 'Lovelace',
        eventTitle: 'A-DNA Ghana Conference 2027',
        tierLabel: 'Tier',
        totalPaid: '$100.00 USD',
        registrationId: 'abc',
        normalizedEmail: 'ada@example.com',
      }),
    );

    expect(html).not.toMatch(/href=/);
    expect(html).toMatch(/Reference ID:/);
    expect(html).toMatch(/abc/);
  });
});
