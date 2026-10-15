import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAppBaseUrl } from '@/lib/app-url';
import { resolveConferenceCheckoutUrl, resolveConferenceZeffyCampaignId } from '@/lib/conferences';
import {
  buildPaidRegistrationConfirmation,
  canClaimConfirmationEmail,
  deliverPaidRegistrationConfirmationWithClaim,
} from '@/lib/email/send-registration-confirmation';
import {
  initializePaystackTransaction,
  parsePaystackTransactionData,
  paystackChargeMatches,
  verifyPaystackWebhookSignature,
} from '@/lib/paystack';
import { usesAfricaRegistrationCatalog } from '@/lib/pricing';
import {
  finalizeRegistrationPaymentForRow,
  listPendingRegistrationsByEmail,
  resolveRegistrationRowForZeffyWebhook,
  type RegistrationPaymentRow,
} from '@/lib/registration-payment-finalize';
import {
  resolveRegistrationPaymentScope,
  syncOneRegistrationPaymentFromZeffy,
} from '@/lib/registration-payment-sync';
import { registrationFormSchema } from '@/lib/schemas/registration';
import {
  countryListScopeForVisitor,
  lookupCountryFromPublicIp,
  normalizeCountryCode,
} from '@/lib/visitor-location';
import { extractWebhookPayment, zeffyFindContactIdByEmail } from '@/lib/zeffy-client';
import { zeffyShouldRouteToStudentCampaign } from '@/lib/zeffy-checkout-urls';

const ROW: RegistrationPaymentRow = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  registration_type: 'diaspora_nurses_allied_health',
  needs_housing: false,
  room_type: null,
  occupancy_type: null,
  registration_amount: 250,
  housing_amount: 0,
  total_amount: 250,
  payment_status: 'pending',
  checkout_correlation_reference: 'checkout-token',
  conference_id: null,
  created_at: 'invalid-date',
  payment_sync_checked_at: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('remaining branch coverage', () => {
  it('covers app URL, visitor, and pricing branches', async () => {
    expect(
      resolveAppBaseUrl({
        headers: new Headers({ origin: 'ftp://bad.example', host: 'good.example.com' }),
      }),
    ).toBe('https://good.example.com');
    expect(normalizeCountryCode('T1')).toBeNull();
    expect(countryListScopeForVisitor({ detectedCountry: null, conferenceWorldCountry: 'all' })).toBe('all');
    expect(usesAfricaRegistrationCatalog('ghana-2027', 'US')).toBe(false);
    await expect(lookupCountryFromPublicIp('not-an-ip')).resolves.toBeNull();
  });

  it('covers conference env resolution branches', () => {
    vi.stubEnv('ZEFFY_CAMPAIGN_ID_GHANA_2027', 'from-slug');
    expect(resolveConferenceZeffyCampaignId('ghana-2027', '  db  ')).toBe('db');
    expect(resolveConferenceZeffyCampaignId('ghana-2027', null)).toBe('from-slug');
    expect(
      resolveConferenceCheckoutUrl({
        slug: 'ghana-2027',
        defaultEnvUrl: 'https://default.example',
      }),
    ).toBe('https://default.example');
  });

  it('covers Paystack helper branches', async () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test';
    process.env.PAYSTACK_USD_TO_GHS = '12';
    expect(paystackChargeMatches({ currency: 'GHS', amountMinor: 1 }, { currency: ' ghs ', amountMinor: 1 })).toBe(
      true,
    );
    expect(verifyPaystackWebhookSignature('body', '')).toBe(false);
    const sig = createHmac('sha512', 'sk_test').update('body').digest('hex');
    expect(verifyPaystackWebhookSignature('body', `${sig}x`)).toBe(false);
    expect(parsePaystackTransactionData({ id: 1, reference: 'r', status: 'success', amount: 1, currency: 'USD' })).toBeTruthy();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          status: true,
          data: { authorization_url: 'https://checkout.test', reference: 'ADNA26-x' },
        }),
      ),
    );
    await initializePaystackTransaction({
      email: 'ada@example.com',
      total: 250,
      tier: 'diaspora_nurses_allied_health',
      reference: 'ADNA26-x',
      registrationId: ROW.id,
      callbackUrl: 'https://app.example/callback',
    });
  });

  it('covers Zeffy webhook extraction and contact retry success', async () => {
    expect(extractWebhookPayment({ type: 'invoice.created' })).toBeNull();
    expect(extractWebhookPayment({ type: 'payment', data: { amount: 1 } })).toBeNull();
    expect(extractWebhookPayment({ type: 'payment', payment: { id: 'direct' } })).toEqual({ id: 'direct' });
    expect(
      extractWebhookPayment({ event: 'payment.completed', data: { payment: { id: 'nested' } } }),
    ).toEqual({ id: 'nested' });
    expect(extractWebhookPayment({ data: { payment_id: 'from-data' } })).toMatchObject({ payment_id: 'from-data' });
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockRejectedValueOnce(new Error('first shape failed'))
        .mockResolvedValueOnce(Response.json({ data: [{ id: 'contact-2' }] })),
    );
    await expect(zeffyFindContactIdByEmail('ada@example.com')).resolves.toBe('contact-2');
    expect(zeffyShouldRouteToStudentCampaign({ is_student: false, registration_type: 'virtual' })).toBe(false);
  });

  it('covers registration email and schema branches', async () => {
    expect(
      canClaimConfirmationEmail({
        payment_status: 'pending',
        confirmation_email_sent_at: null,
        confirmation_email_claimed_at: null,
      }),
    ).toBe(false);
    const content = buildPaidRegistrationConfirmation({
      ...ROW,
      total_amount: 'not-a-number',
      registration_type: 'diaspora_nurses_allied_health',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@example.com',
    });
    expect(content.totalPaid).toBe('not-a-number');

    expect(
      registrationFormSchema.safeParse({
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
        phone: '4105550100',
        professional_role: 'registered_nurse',
        professional_role_other: '',
        highest_degree: 'BSN',
        institution: 'Org',
        department: '',
        is_student: false,
        country: 'US',
        state_region: 'MD',
        city: 'Baltimore',
        dietary_requirements: 'none',
        dietary_other: '',
        accessibility_needs: 'none',
        accessibility_other: '',
        additional_notes: '',
        needs_housing: 'yes',
        room_type: 'A',
        occupancy_type: 'shared',
        heard_about_us: ['website'],
        heard_about_other: '',
        instagram_handle: '',
        x_handle: '',
        linkedin_url: '',
        facebook_handle: '',
        other_social: '',
        registration_type: 'conference_only',
        conference_slug: 'usa-2026',
        conference_housing_enabled: false,
      }).success,
    ).toBe(true);
  });

  it('covers payment finalize and sync branches', async () => {
    const supabaseList = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [{ ...ROW, total_amount: 'not-a-number' }],
              error: null,
            }),
          }),
        }),
      }),
    };
    await expect(listPendingRegistrationsByEmail(supabaseList as never, ROW.email!)).resolves.toEqual([]);

    const scope = await resolveRegistrationPaymentScope({} as never, {
      ...ROW,
      conference_id: null,
      created_at: 'not-a-date',
    });
    expect(scope.createdGteUnix).toBeGreaterThan(0);

    await expect(
      syncOneRegistrationPaymentFromZeffy({} as never, { ...ROW, total_amount: '100.00' }, {
        matchPayment: async () => ({
          paymentId: 'pay',
          status: 'succeeded',
          amountCents: 10_000,
          currencyLower: 'usd',
        }),
        finalize: async () => ({ outcome: 'paid', registrationId: ROW.id }),
        sendConfirmation: async () => true,
        resolvePaymentScope: async () => ({ createdGteUnix: 1 }),
      }),
    ).resolves.toMatchObject({ outcome: 'paid' });

    await expect(
      resolveRegistrationRowForZeffyWebhook({
        supabase: {
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
                eq: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        } as never,
        paymentObject: {},
        payerEmailLower: ROW.email!,
        envelope: { registration_id: ROW.id },
        verifiedAmountCents: 25_000,
      }),
    ).resolves.toEqual({ rejectReason: 'not_found_pending_registration' });

    await expect(
      finalizeRegistrationPaymentForRow(
        { from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }), rpc: async () => ({ data: 'weird', error: null }) } as never,
        ROW,
        'pay-1',
        25_000,
      ),
    ).resolves.toMatchObject({ outcome: 'db_error' });
  });

  it('covers deliverPaidRegistrationConfirmationWithClaim fetch success with empty claim token', async () => {
    const supabase = {
      rpc: async () => ({ data: '   ', error: null }),
      from: vi.fn(),
    };
    await expect(
      deliverPaidRegistrationConfirmationWithClaim(supabase as never, ROW.id),
    ).resolves.toBe(false);
  });
});
