import { afterEach, describe, expect, it } from 'vitest';

import {
  parsePaystackTransactionData,
  paystackChargeMatches,
  resolvePaystackCharge,
  resolvePaystackCurrency,
  shouldUsePaystackCheckout,
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
});
