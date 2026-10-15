import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initializePaystackTransaction,
  parsePaystackTransactionData,
  paystackChargeMatches,
  paystackSecretKey,
  resolvePaystackCharge,
  resolvePaystackCurrency,
  resolveUsdToGhsRate,
  sanitizePaystackReference,
  shouldUsePaystackCheckout,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from '@/lib/paystack';

describe('shouldUsePaystackCheckout', () => {
  it('routes Ghana and other African countries to Paystack', () => {
    expect(shouldUsePaystackCheckout('GH')).toBe(true);
    expect(shouldUsePaystackCheckout('ng')).toBe(true);
    expect(shouldUsePaystackCheckout('KE')).toBe(true);
    expect(shouldUsePaystackCheckout('ZA')).toBe(true);
  });

  it('keeps non-African countries on Zeffy', () => {
    expect(shouldUsePaystackCheckout('US')).toBe(false);
    expect(shouldUsePaystackCheckout('GB')).toBe(false);
    expect(shouldUsePaystackCheckout('')).toBe(false);
    expect(shouldUsePaystackCheckout(null)).toBe(false);
  });
});

describe('resolvePaystackCharge', () => {
  const previous = {
    currency: process.env.PAYSTACK_CURRENCY,
    rate: process.env.PAYSTACK_USD_TO_GHS,
  };

  afterEach(() => {
    if (previous.currency === undefined) delete process.env.PAYSTACK_CURRENCY;
    else process.env.PAYSTACK_CURRENCY = previous.currency;
    if (previous.rate === undefined) delete process.env.PAYSTACK_USD_TO_GHS;
    else process.env.PAYSTACK_USD_TO_GHS = previous.rate;
  });

  it('defaults to GHS using the configured or fallback USD rate', () => {
    delete process.env.PAYSTACK_CURRENCY;
    delete process.env.PAYSTACK_USD_TO_GHS;
    expect(resolvePaystackCurrency()).toBe('GHS');
    expect(resolvePaystackCharge(250, 'diaspora_nurses_allied_health')).toEqual({
      currency: 'GHS',
      amountMinor: 300_000,
      amountUsdCents: 25_000,
      usdToGhs: 12,
    });
  });

  it('can charge USD cents when PAYSTACK_CURRENCY=USD', () => {
    process.env.PAYSTACK_CURRENCY = 'USD';
    expect(resolvePaystackCharge(150, 'low_moderate_income_nurses_allied_health')).toEqual({
      currency: 'USD',
      amountMinor: 15_000,
      amountUsdCents: 15_000,
      usdToGhs: null,
    });
  });

  it('matches a verified Paystack amount', () => {
    delete process.env.PAYSTACK_CURRENCY;
    const charge = resolvePaystackCharge(250, 'diaspora_nurses_allied_health');
    expect(paystackChargeMatches(charge, { amountMinor: 300_000, currency: 'GHS' })).toBe(true);
    expect(paystackChargeMatches(charge, { amountMinor: 25_000, currency: 'USD' })).toBe(false);
  });

  it('charges Africa catalog tickets in cedis without applying the USD rate', () => {
    process.env.PAYSTACK_CURRENCY = 'USD';
    process.env.PAYSTACK_USD_TO_GHS = '15';
    const charge = resolvePaystackCharge(1500, 'african_nurses_midwives');
    expect(charge).toEqual({
      currency: 'GHS',
      amountMinor: 150_000,
      amountUsdCents: null,
      usdToGhs: null,
    });
    expect(paystackChargeMatches(charge, { amountMinor: 150_000, currency: 'GHS' })).toBe(true);
    expect(paystackChargeMatches(charge, { amountMinor: 1_800_000, currency: 'GHS' })).toBe(false);
  });
});

describe('Paystack webhook helpers', () => {
  const previousKey = process.env.PAYSTACK_SECRET_KEY;

  afterEach(() => {
    if (previousKey === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = previousKey;
  });

  it('parses a charge.success data object', () => {
    const parsed = parsePaystackTransactionData({
      id: 99,
      reference: 'ADNA26-abc',
      status: 'success',
      amount: 300000,
      currency: 'GHS',
      channel: 'mobile_money',
      paid_at: '2026-10-02T12:00:00.000Z',
      customer: { email: 'Ada@Example.com' },
    });
    expect(parsed).toMatchObject({
      id: 99,
      reference: 'ADNA26-abc',
      status: 'success',
      amountMinor: 300000,
      currency: 'GHS',
      email: 'ada@example.com',
    });
  });

  it('rejects a forged webhook signature', () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_secret';
    expect(verifyPaystackWebhookSignature('{"event":"charge.success"}', 'deadbeef')).toBe(false);
  });

  it('accepts a valid webhook signature', () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_secret';
    const body = '{"event":"charge.success"}';
    const signature = createHmac('sha512', 'sk_test_secret').update(body).digest('hex');
    expect(verifyPaystackWebhookSignature(body, signature)).toBe(true);
    expect(verifyPaystackWebhookSignature(body, null)).toBe(false);
  });
});

describe('Paystack reference and secrets', () => {
  const previousKey = process.env.PAYSTACK_SECRET_KEY;

  afterEach(() => {
    if (previousKey === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = previousKey;
  });

  it('sanitizes references and rejects empty values', () => {
    expect(sanitizePaystackReference(' ADNA26-abc! ')).toBe('ADNA26-abc');
    expect(() => sanitizePaystackReference('***')).toThrow(/Invalid Paystack reference/);
  });

  it('requires PAYSTACK_SECRET_KEY', () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(() => paystackSecretKey()).toThrow(/Missing PAYSTACK_SECRET_KEY/);
  });

  it('validates the USD→GHS rate', () => {
    process.env.PAYSTACK_USD_TO_GHS = 'not-a-number';
    expect(() => resolveUsdToGhsRate()).toThrow(/PAYSTACK_USD_TO_GHS/);
    process.env.PAYSTACK_USD_TO_GHS = '-1';
    expect(() => resolveUsdToGhsRate()).toThrow(/PAYSTACK_USD_TO_GHS/);
  });

  it('rejects invalid charge totals', () => {
    expect(() => resolvePaystackCharge(0, 'conference_only')).toThrow(/Invalid total/);
  });
});

describe('parsePaystackTransactionData edge cases', () => {
  it('returns null for malformed payloads', () => {
    expect(parsePaystackTransactionData(null)).toBeNull();
    expect(parsePaystackTransactionData({ id: 'x', reference: '', amount: 1, currency: 'USD' })).toBeNull();
    expect(
      parsePaystackTransactionData({
        id: '42',
        reference: 'ref',
        status: 'success',
        amount: '500',
        currency: 99,
      }),
    ).toBeNull();
    expect(
      parsePaystackTransactionData({
        id: 7,
        reference: 123,
        status: 'success',
        amount: 500,
        currency: 'USD',
      }),
    ).toBeNull();
    expect(
      parsePaystackTransactionData({
        id: '7',
        reference: 'ref',
        status: 'success',
        amount: '500',
        currency: 'USD',
      }),
    ).toMatchObject({ id: 7, amountMinor: 500 });
    expect(
      parsePaystackTransactionData({
        id: undefined,
        reference: 'ref',
        status: 'success',
        amount: undefined,
        currency: 'USD',
      }),
    ).toBeNull();
  });

  it('reads email from the top-level field when customer is missing', () => {
    expect(
      parsePaystackTransactionData({
        id: 1,
        reference: 'ref',
        status: 'SUCCESS',
        amount: '500',
        currency: 'GHS',
        email: 'Ada@Example.com',
      }),
    ).toMatchObject({ email: 'ada@example.com', status: 'success' });
  });
});

describe('Paystack API client', () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_secret';
    process.env.PAYSTACK_USD_TO_GHS = '12';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it('initializes a transaction and adds Ghana channels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.channels).toEqual(['card', 'mobile_money', 'bank']);
        return Response.json({
          status: true,
          data: { authorization_url: 'https://checkout.paystack.com/abc', reference: 'ADNA26-abc' },
        });
      }),
    );

    await expect(
      initializePaystackTransaction({
        email: 'ada@example.com',
        total: 1500,
        tier: 'african_nurses_midwives',
        reference: 'ADNA26-abc',
        registrationId: '11111111-1111-1111-1111-111111111111',
        callbackUrl: 'https://app.example/callback',
      }),
    ).resolves.toEqual({
      authorizationUrl: 'https://checkout.paystack.com/abc',
      reference: 'ADNA26-abc',
    });
  });

  it('omits mobile-money channels for USD tiers', async () => {
    process.env.PAYSTACK_CURRENCY = 'USD';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.channels).toBeUndefined();
        return Response.json({
          status: true,
          data: { authorization_url: 'https://checkout.paystack.com/usd', reference: 'ADNA26-usd' },
        });
      }),
    );
    await initializePaystackTransaction({
      email: 'ada@example.com',
      total: 250,
      tier: 'diaspora_nurses_allied_health',
      reference: 'ADNA26-usd',
      registrationId: '11111111-1111-1111-1111-111111111111',
      callbackUrl: 'https://app.example/callback',
    });
  });

  it('surfaces Paystack initialize failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: false, message: 'bad request' }, { status: 400 })),
    );
    await expect(
      initializePaystackTransaction({
        email: 'ada@example.com',
        total: 250,
        tier: 'diaspora_nurses_allied_health',
        reference: 'ADNA26-x',
        registrationId: '11111111-1111-1111-1111-111111111111',
        callbackUrl: 'https://app.example/callback',
      }),
    ).rejects.toThrow(/bad request/);
  });

  it('verifies transactions via the Paystack API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        expect(String(url)).toMatch(/verify\/ADNA26-ref/);
        return Response.json({
          status: true,
          data: {
            id: 9,
            reference: 'ADNA26-ref',
            status: 'success',
            amount: 25_000,
            currency: 'USD',
          },
        });
      }),
    );

    await expect(verifyPaystackTransaction('ADNA26-ref')).resolves.toMatchObject({
      reference: 'ADNA26-ref',
      amountMinor: 25_000,
    });
  });

  it('returns null when verification status is false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: false })));
    await expect(verifyPaystackTransaction('missing')).resolves.toBeNull();
  });

  it('uses the default initialize error when Paystack omits a message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: true, data: {} })),
    );
    await expect(
      initializePaystackTransaction({
        email: 'ada@example.com',
        total: 250,
        tier: 'diaspora_nurses_allied_health',
        reference: 'ADNA26-x',
        registrationId: '11111111-1111-4111-8111-111111111111',
        callbackUrl: 'https://app.example/callback',
      }),
    ).rejects.toThrow(/did not return a checkout URL/);
  });

  it('tolerates non-JSON Paystack error bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('invalid json');
        },
      })),
    );
    await expect(verifyPaystackTransaction('ADNA26-x')).rejects.toThrow(/502/);
  });
});
