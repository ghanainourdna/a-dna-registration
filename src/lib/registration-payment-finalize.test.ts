import { afterEach, describe, expect, it, vi } from 'vitest';

import * as paystackLib from '@/lib/paystack';
import * as registrationSchema from '@/lib/schemas/registration';

import {
  fetchRegistrationPaymentRowForFinalize,
  finalizePaystackRegistrationPayment,
  finalizeRegistrationPaymentForRow,
  findRegistrationByCorrelationToken,
  isDuplicateKeyViolation,
  listPendingRegistrationsByEmail,
  registrationUuidGuessFromDeepScan,
  resolveRegistrationRowForZeffyWebhook,
  type RegistrationPaymentRow,
} from '@/lib/registration-payment-finalize';

afterEach(() => {
  vi.restoreAllMocks();
});

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
  conference_id: '22222222-2222-2222-2222-222222222222',
  created_at: '2026-09-02T12:00:00.000Z',
  payment_sync_checked_at: null,
};

describe('isDuplicateKeyViolation', () => {
  it('matches postgres duplicate key errors by code or message', () => {
    expect(isDuplicateKeyViolation(null)).toBe(false);
    expect(isDuplicateKeyViolation({ code: '23505' })).toBe(true);
    expect(isDuplicateKeyViolation({ message: 'duplicate key value violates unique constraint' })).toBe(true);
    expect(isDuplicateKeyViolation({ message: 'other db error' })).toBe(false);
    expect(isDuplicateKeyViolation({ code: '23505', message: undefined })).toBe(true);
    expect(isDuplicateKeyViolation({ message: undefined })).toBe(false);
  });
});

describe('registrationUuidGuessFromDeepScan', () => {
  it('finds the first UUID nested in webhook payloads', () => {
    expect(
      registrationUuidGuessFromDeepScan(['11111111-1111-4111-8111-111111111111']),
    ).toBe('11111111-1111-4111-8111-111111111111');
    expect(
      registrationUuidGuessFromDeepScan({
        meta: { nested: { registration_id: '22222222-2222-4222-8222-222222222222' } },
      }),
    ).toBe('22222222-2222-4222-8222-222222222222');
    expect(
      registrationUuidGuessFromDeepScan({
        outer: { inner: '11111111-1111-4111-8111-111111111111' },
      }),
    ).toBe('11111111-1111-4111-8111-111111111111');
    expect(
      registrationUuidGuessFromDeepScan({
        count: 1,
        payload: { token: '33333333-3333-4333-8333-333333333333' },
      }),
    ).toBe('33333333-3333-4333-8333-333333333333');
    expect(registrationUuidGuessFromDeepScan({ ignored: null })).toBeNull();
  });
});

describe('registration payment row lookups', () => {
  it('loads, finds, and lists pending rows', async () => {
    const row = ROW;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: string) => ({
            maybeSingle: async () =>
              column === 'id' || column === 'checkout_correlation_reference'
                ? { data: row, error: null }
                : { data: null, error: null },
            eq: async () => ({ data: [row], error: null }),
          }),
        }),
      }),
    };

    await expect(fetchRegistrationPaymentRowForFinalize(supabase as never, row.id)).resolves.toEqual(row);

    const missingRow = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    await expect(fetchRegistrationPaymentRowForFinalize(missingRow as never, row.id)).resolves.toBeNull();
    const undefinedRow = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: undefined, error: null }),
          }),
        }),
      }),
    };
    await expect(fetchRegistrationPaymentRowForFinalize(undefinedRow as never, row.id)).resolves.toBeNull();
    await expect(findRegistrationByCorrelationToken(supabase as never, 'checkout-token')).resolves.toEqual(
      row,
    );
    await expect(findRegistrationByCorrelationToken(supabase as never, '   ')).resolves.toBeNull();
    await expect(listPendingRegistrationsByEmail(supabase as never, row.email!)).resolves.toEqual([row]);

    const numericTotal = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [{ ...row, total_amount: 250 }],
              error: null,
            }),
          }),
        }),
      }),
    };
    await expect(listPendingRegistrationsByEmail(numericTotal as never, row.email!)).resolves.toHaveLength(1);

    const nullData = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    await expect(listPendingRegistrationsByEmail(nullData as never, row.email!)).resolves.toEqual([]);

    const undefinedData = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: undefined, error: null }),
          }),
        }),
      }),
    };
    await expect(listPendingRegistrationsByEmail(undefinedData as never, row.email!)).resolves.toEqual([]);

    const mixedTotals = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [row, { ...row, id: '22222222-2222-4222-8222-222222222222', total_amount: 'bad' }],
              error: null,
            }),
          }),
        }),
      }),
    };
    await expect(listPendingRegistrationsByEmail(mixedTotals as never, row.email!)).resolves.toEqual([row]);
  });

  it('throws when correlation lookup fails', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'db down' } }),
          }),
        }),
      }),
    };
    await expect(findRegistrationByCorrelationToken(supabase as never, 'token')).rejects.toThrow(/db down/);
  });

  it('throws when Supabase lookup fails', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'db down' } }),
          }),
        }),
      }),
    };
    await expect(fetchRegistrationPaymentRowForFinalize(supabase as never, ROW.id)).rejects.toThrow(/db down/);
  });
});

describe('finalizeRegistrationPaymentForRow', () => {
  it('marks pricing and amount mismatches as rejected', async () => {
    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
    const supabase = {
      from: () => ({ update }),
      rpc: vi.fn(),
    };
    const badPricing = { ...ROW, registration_amount: 999 };
    await expect(
      finalizeRegistrationPaymentForRow(supabase as never, badPricing, 'pay-1', 25_000),
    ).resolves.toEqual({ outcome: 'rejected', reason: 'pricing_mismatch' });

    vi.spyOn(registrationSchema, 'assertPricingMatches').mockReturnValueOnce(true);
    await expect(
      finalizeRegistrationPaymentForRow(
        supabase as never,
        { ...ROW, total_amount: Number.NaN },
        'pay-1',
        25_000,
      ),
    ).resolves.toEqual({ outcome: 'rejected', reason: 'invalid_total' });

    await expect(
      finalizeRegistrationPaymentForRow(supabase as never, ROW, 'pay-1', 1),
    ).resolves.toEqual({ outcome: 'rejected', reason: 'amount_mismatch' });
  });

  it('parses string totals before finalizing through RPC', async () => {
    vi.spyOn(registrationSchema, 'assertPricingMatches').mockReturnValue(true);
    const supabase = {
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
      rpc: vi.fn(async () => ({ data: 'paid', error: null })),
    };
    await expect(
      finalizeRegistrationPaymentForRow(
        supabase as never,
        { ...ROW, total_amount: '250.00' },
        'pay-1',
        25_000,
      ),
    ).resolves.toEqual({ outcome: 'paid', registrationId: ROW.id });
  });

  it('parses numeric totals before finalizing through RPC', async () => {
    vi.spyOn(registrationSchema, 'assertPricingMatches').mockReturnValue(true);
    const supabase = {
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
      rpc: vi.fn(async () => ({ data: 'paid', error: null })),
    };
    await expect(
      finalizeRegistrationPaymentForRow(
        supabase as never,
        { ...ROW, total_amount: 250 },
        'pay-1',
        25_000,
      ),
    ).resolves.toEqual({ outcome: 'paid', registrationId: ROW.id });
  });

  it('returns already_paid without calling RPC', async () => {
    await expect(
      finalizeRegistrationPaymentForRow({} as never, { ...ROW, payment_status: 'paid' }, 'pay-1', 25_000),
    ).resolves.toEqual({ outcome: 'already_paid', registrationId: ROW.id });
  });

  it('marks paid through RPC and surfaces unknown outcomes', async () => {
    const supabase = {
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
      rpc: vi
        .fn()
        .mockResolvedValueOnce({ data: 'paid', error: null })
        .mockResolvedValueOnce({ data: 'already_paid', error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } })
        .mockResolvedValueOnce({ data: 'weird', error: null })
        .mockResolvedValueOnce({ data: null, error: null }),
    };

    await expect(
      finalizeRegistrationPaymentForRow(supabase as never, ROW, 'pay-1', 25_000),
    ).resolves.toEqual({ outcome: 'paid', registrationId: ROW.id });
    await expect(
      finalizeRegistrationPaymentForRow(supabase as never, ROW, 'pay-1', 25_000),
    ).resolves.toEqual({ outcome: 'already_paid', registrationId: ROW.id });
    await expect(
      finalizeRegistrationPaymentForRow(supabase as never, ROW, 'pay-1', 25_000),
    ).resolves.toEqual({ outcome: 'db_error', message: 'rpc failed' });
    await expect(
      finalizeRegistrationPaymentForRow(supabase as never, ROW, 'pay-1', 25_000),
    ).resolves.toEqual({ outcome: 'db_error', message: expect.stringMatching(/weird/) });
    await expect(
      finalizeRegistrationPaymentForRow(supabase as never, ROW, 'pay-1', 25_000),
    ).resolves.toEqual({ outcome: 'db_error', message: expect.stringMatching(/no outcome/) });
  });

  it('does not reuse a Zeffy payment claimed by another registration', async () => {
    const rpc = vi.fn(async () => ({
      data: 'payment_already_used',
      error: null,
    }));
    const supabase = {
      rpc,
    };

    await expect(
      finalizeRegistrationPaymentForRow(supabase as never, ROW, 'payment-1', 25_000),
    ).resolves.toEqual({ outcome: 'rejected', reason: 'payment_already_used' });
    expect(rpc).toHaveBeenCalledWith('finalize_zeffy_registration_payment', {
      p_registration_id: ROW.id,
      p_external_payment_id: 'payment-1',
      p_amount_cents: 25_000,
    });
  });

  it('rejects a second distinct payment after another finalization wins', async () => {
    const supabase = {
      rpc: async () => ({ data: 'registration_already_paid', error: null }),
    };

    await expect(
      finalizeRegistrationPaymentForRow(supabase as never, ROW, 'payment-2', 25_000),
    ).resolves.toEqual({
      outcome: 'rejected',
      reason: 'registration_already_paid',
    });
  });
});

describe('resolveRegistrationRowForZeffyWebhook', () => {
  function lookupSupabase(row: RegistrationPaymentRow = ROW) {
    return {
      from: () => ({
        select: () => ({
          eq: (column: string, value: string) => {
            if (column === 'id' || column === 'checkout_correlation_reference') {
              return {
                maybeSingle: async () =>
                  value === row.id || value === row.checkout_correlation_reference?.trim()
                    ? { data: row, error: null }
                    : { data: null, error: null },
              };
            }
            return {
              eq: async () => ({ data: [row], error: null }),
            };
          },
        }),
      }),
    };
  }

  it('requires a checkout correlation when falling back to email and amount', async () => {
    const result = await resolveRegistrationRowForZeffyWebhook({
      supabase: lookupSupabase() as never,
      paymentObject: { id: 'payment-1' },
      payerEmailLower: ROW.email!,
      envelope: { type: 'payment.completed' },
      verifiedAmountCents: 25_000,
    });

    expect(result).toEqual({ rejectReason: 'missing_checkout_correlation' });
  });

  it('accepts the email and amount fallback when the checkout token is present', async () => {
    const result = await resolveRegistrationRowForZeffyWebhook({
      supabase: lookupSupabase() as never,
      paymentObject: { id: 'payment-1', checkout_reference: ROW.checkout_correlation_reference },
      payerEmailLower: ROW.email!,
      envelope: { type: 'payment.completed' },
      verifiedAmountCents: 25_000,
    });

    expect(result).toEqual({ row: ROW });
  });

  it('matches by UUID when amount and email align', async () => {
    const result = await resolveRegistrationRowForZeffyWebhook({
      supabase: lookupSupabase() as never,
      paymentObject: { id: 'payment-1' },
      payerEmailLower: ROW.email!,
      envelope: { registration_id: ROW.id },
      verifiedAmountCents: 25_000,
    });
    expect(result).toEqual({ row: ROW });
  });

  it('scans the envelope when the payment object has no uuid', async () => {
    const result = await resolveRegistrationRowForZeffyWebhook({
      supabase: lookupSupabase() as never,
      paymentObject: { note: ROW.id },
      payerEmailLower: ROW.email!,
      envelope: null,
      verifiedAmountCents: 25_000,
    });
    expect(result).toEqual({ row: ROW });
  });

  it('rejects UUID matches when email differs', async () => {
    const result = await resolveRegistrationRowForZeffyWebhook({
      supabase: lookupSupabase() as never,
      paymentObject: { id: 'payment-1' },
      payerEmailLower: 'other@example.com',
      envelope: { registration_id: ROW.id },
      verifiedAmountCents: 25_000,
    });
    expect(result).toEqual({ rejectReason: 'email_uuid_mismatch' });
  });

  it('requires buyer email and reports missing pending rows', async () => {
    await expect(
      resolveRegistrationRowForZeffyWebhook({
        supabase: lookupSupabase({ ...ROW, checkout_correlation_reference: null }) as never,
        paymentObject: {},
        payerEmailLower: ' ',
        envelope: {},
        verifiedAmountCents: 25_000,
      }),
    ).resolves.toEqual({ rejectReason: 'missing_buyer_email' });

    await expect(
      resolveRegistrationRowForZeffyWebhook({
        supabase: lookupSupabase({ ...ROW, total_amount: 999 }) as never,
        paymentObject: {},
        payerEmailLower: ROW.email!,
        envelope: {},
        verifiedAmountCents: 25_000,
      }),
    ).resolves.toEqual({ rejectReason: 'not_found_pending_registration' });
  });
});

describe('finalizePaystackRegistrationPayment', () => {
  const verified = {
    id: 42,
    reference: 'ADNA26-ref',
    status: 'success',
    amountMinor: 150_000,
    currency: 'GHS',
    channel: 'mobile_money',
    paidAt: '2026-10-02T12:00:00.000Z',
    email: 'ada@example.com',
    payload: { id: 42 },
  };

  it('finalizes a pending Ghana registration', async () => {
    const paystackRow: RegistrationPaymentRow = {
      ...ROW,
      registration_type: 'african_nurses_midwives',
      registration_amount: 1500,
      total_amount: 1500,
      country: 'GH',
    };
    const supabase = {
      from: (table: string) => {
        if (table === 'paystack_transactions' || table === 'provider_payment_audit') {
          return { insert: async () => ({ error: null }) };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: { id: paystackRow.id }, error: null }),
                }),
              }),
            }),
          }),
        };
      },
    };

    await expect(
      finalizePaystackRegistrationPayment(supabase as never, paystackRow, verified),
    ).resolves.toEqual({ outcome: 'paid', registrationId: paystackRow.id });
  });

  it('rejects invalid totals and amount mismatches', async () => {
    await expect(
      finalizePaystackRegistrationPayment(
        {} as never,
        { ...ROW, payment_status: 'paid' },
        verified,
      ),
    ).resolves.toEqual({ outcome: 'already_paid', registrationId: ROW.id });

    const supabase = {
      from: () => ({
        update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      }),
    };
    await expect(
      finalizePaystackRegistrationPayment(
        supabase as never,
        { ...ROW, registration_amount: 999 },
        verified,
      ),
    ).resolves.toEqual({ outcome: 'rejected', reason: 'pricing_mismatch' });

    vi.spyOn(registrationSchema, 'assertPricingMatches').mockReturnValueOnce(true);
    await expect(
      finalizePaystackRegistrationPayment(
        supabase as never,
        { ...ROW, total_amount: Number.NaN },
        verified,
      ),
    ).resolves.toEqual({ outcome: 'rejected', reason: 'invalid_total' });

    vi.spyOn(registrationSchema, 'assertPricingMatches').mockReturnValueOnce(true);
    vi.spyOn(paystackLib, 'resolvePaystackCharge').mockImplementation(() => {
      throw new Error('rate missing');
    });
    await expect(
      finalizePaystackRegistrationPayment(supabase as never, ROW, verified),
    ).resolves.toEqual({ outcome: 'rejected', reason: 'invalid_total' });
  });

  it('rejects failed Paystack verification amounts', async () => {
    const paystackRow: RegistrationPaymentRow = {
      ...ROW,
      registration_type: 'african_nurses_midwives',
      registration_amount: 1500,
      total_amount: 1500,
    };
    await expect(
      finalizePaystackRegistrationPayment(
        {} as never,
        paystackRow,
        { ...verified, status: 'failed' },
      ),
    ).resolves.toEqual({ outcome: 'rejected', reason: 'amount_mismatch' });
  });

  it('treats duplicate paystack transaction rows as idempotent', async () => {
    const paystackRow: RegistrationPaymentRow = {
      ...ROW,
      registration_type: 'african_nurses_midwives',
      registration_amount: 1500,
      total_amount: '1500.00',
    };
    const supabase = {
      from: (table: string) => {
        if (table === 'paystack_transactions') {
          return {
            insert: async () => ({
              error: { message: 'duplicate key value violates unique constraint "paystack_pkey"' },
            }),
          };
        }
        if (table === 'provider_payment_audit') {
          return { insert: async () => ({ error: null }) };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: { id: paystackRow.id }, error: null }),
                }),
              }),
            }),
          }),
        };
      },
    };
    await expect(
      finalizePaystackRegistrationPayment(supabase as never, paystackRow, verified),
    ).resolves.toEqual({ outcome: 'paid', registrationId: paystackRow.id });
  });

  it('treats duplicate audit rows as success and handles update races', async () => {
    const paystackRow: RegistrationPaymentRow = {
      ...ROW,
      registration_type: 'african_nurses_midwives',
      registration_amount: 1500,
      total_amount: 1500,
    };
    let registrationStatus: 'pending' | 'paid' = 'pending';
    const supabase = {
      from: (table: string) => {
        if (table === 'paystack_transactions') {
          return {
            insert: async () => ({
              error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            }),
          };
        }
        if (table === 'provider_payment_audit') {
          return { insert: async () => ({ error: null }) };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { payment_status: registrationStatus }, error: null }),
            }),
          }),
        };
      },
    };

    registrationStatus = 'paid';
    await expect(
      finalizePaystackRegistrationPayment(supabase as never, paystackRow, verified),
    ).resolves.toEqual({ outcome: 'already_paid', registrationId: paystackRow.id });
  });

  it('treats duplicate audit rows matched by message as idempotent', async () => {
    const paystackRow: RegistrationPaymentRow = {
      ...ROW,
      registration_type: 'african_nurses_midwives',
      registration_amount: 1500,
      total_amount: 1500,
    };
    const supabase = {
      from: (table: string) => {
        if (table === 'paystack_transactions') {
          return { insert: async () => ({ error: null }) };
        }
        if (table === 'provider_payment_audit') {
          return {
            insert: async () => ({
              error: { message: 'duplicate key value violates unique constraint "audit_pkey"' },
            }),
          };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: { id: paystackRow.id }, error: null }),
                }),
              }),
            }),
          }),
        };
      },
    };
    await expect(
      finalizePaystackRegistrationPayment(supabase as never, paystackRow, verified),
    ).resolves.toEqual({ outcome: 'paid', registrationId: paystackRow.id });
  });

  it('marks paid when audit duplicates but the registration update succeeds', async () => {
    const paystackRow: RegistrationPaymentRow = {
      ...ROW,
      registration_type: 'african_nurses_midwives',
      registration_amount: 1500,
      total_amount: 1500,
    };
    const supabase = {
      from: (table: string) => {
        if (table === 'paystack_transactions') {
          return { insert: async () => ({ error: null }) };
        }
        if (table === 'provider_payment_audit') {
          return {
            insert: async () => ({
              error: { message: 'duplicate key value violates unique constraint "audit_unique"' },
            }),
          };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: { id: paystackRow.id }, error: null }),
                }),
              }),
            }),
          }),
        };
      },
    };

    await expect(
      finalizePaystackRegistrationPayment(supabase as never, paystackRow, verified),
    ).resolves.toEqual({ outcome: 'paid', registrationId: paystackRow.id });
  });

  it('surfaces Paystack insert, audit, and update failures', async () => {
    const paystackRow: RegistrationPaymentRow = {
      ...ROW,
      registration_type: 'african_nurses_midwives',
      registration_amount: 1500,
      total_amount: 1500,
    };
    const supabase = {
      from: (table: string) => {
        if (table === 'paystack_transactions') {
          return { insert: async () => ({ error: { message: 'insert failed', code: 'XX000' } }) };
        }
        if (table === 'provider_payment_audit') {
          return { insert: async () => ({ error: { message: 'audit failed' } }) };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: { message: 'update failed' } }),
                }),
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { payment_status: 'failed' }, error: null }),
            }),
          }),
        };
      },
    };

    await expect(
      finalizePaystackRegistrationPayment(supabase as never, paystackRow, verified),
    ).resolves.toEqual({ outcome: 'db_error', message: 'insert failed' });

    const auditFail = {
      from: (table: string) => {
        if (table === 'paystack_transactions') return { insert: async () => ({ error: null }) };
        if (table === 'provider_payment_audit') {
          return { insert: async () => ({ error: { message: 'audit failed hard' } }) };
        }
        return { update: vi.fn() };
      },
    };
    await expect(
      finalizePaystackRegistrationPayment(auditFail as never, paystackRow, verified),
    ).resolves.toEqual({ outcome: 'db_error', message: 'audit failed hard' });

    const updateFail = {
      from: (table: string) => {
        if (table === 'paystack_transactions' || table === 'provider_payment_audit') {
          return { insert: async () => ({ error: null }) };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: { message: 'update failed' } }),
                }),
              }),
            }),
          }),
        };
      },
    };
    await expect(
      finalizePaystackRegistrationPayment(updateFail as never, paystackRow, verified),
    ).resolves.toEqual({ outcome: 'db_error', message: 'update failed' });

    const reloadFail = {
      from: (table: string) => {
        if (table === 'paystack_transactions' || table === 'provider_payment_audit') {
          return { insert: async () => ({ error: null }) };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: 'reload failed' } }),
            }),
          }),
        };
      },
    };
    await expect(
      finalizePaystackRegistrationPayment(reloadFail as never, paystackRow, verified),
    ).resolves.toEqual({ outcome: 'db_error', message: 'reload failed' });

    const statusChanged = {
      from: (table: string) => {
        if (table === 'paystack_transactions' || table === 'provider_payment_audit') {
          return { insert: async () => ({ error: null }) };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { payment_status: 'failed' }, error: null }),
            }),
          }),
        };
      },
    };
    await expect(
      finalizePaystackRegistrationPayment(statusChanged as never, paystackRow, verified),
    ).resolves.toEqual({
      outcome: 'db_error',
      message: expect.stringMatching(/changed to failed/),
    });

    const missingStatus = {
      from: (table: string) => {
        if (table === 'paystack_transactions' || table === 'provider_payment_audit') {
          return { insert: async () => ({ error: null }) };
        }
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    };
    await expect(
      finalizePaystackRegistrationPayment(missingStatus as never, paystackRow, verified),
    ).resolves.toEqual({
      outcome: 'db_error',
      message: expect.stringMatching(/missing/),
    });
  });
});

describe('resolveRegistrationRowForZeffyWebhook uuid path', () => {
  function supabaseForRow(row: RegistrationPaymentRow | null) {
    return {
      from: () => ({
        select: () => ({
          eq: (column: string, value: string) => {
            if (column === 'id') {
              return {
                maybeSingle: async () => ({ data: row, error: null }),
              };
            }
            return {
              eq: async () => ({ data: row ? [row] : [], error: null }),
            };
          },
        }),
      }),
    };
  }

  it('falls through when uuid lookup amount does not match', async () => {
    await expect(
      resolveRegistrationRowForZeffyWebhook({
        supabase: supabaseForRow({ ...ROW, checkout_correlation_reference: null }) as never,
        paymentObject: {},
        payerEmailLower: ROW.email!,
        envelope: { registration_id: ROW.id },
        verifiedAmountCents: 1,
      }),
    ).resolves.toEqual({ rejectReason: 'not_found_pending_registration' });
  });

  it('accepts uuid match when payer email is omitted on the row', async () => {
    await expect(
      resolveRegistrationRowForZeffyWebhook({
        supabase: supabaseForRow({ ...ROW, email: undefined }) as never,
        paymentObject: {},
        payerEmailLower: 'ada@example.com',
        envelope: { registration_id: ROW.id },
        verifiedAmountCents: 25_000,
      }),
    ).resolves.toEqual({ row: { ...ROW, email: undefined } });
  });
});

describe('resolveRegistrationRowForZeffyWebhook ambiguity', () => {
  it('returns ambiguous when multiple checkout tokens match', async () => {
    const rowA = { ...ROW, id: '11111111-1111-4111-8111-111111111111', checkout_correlation_reference: 'token-a' };
    const rowB = { ...ROW, id: '22222222-2222-4222-8222-222222222222', checkout_correlation_reference: 'token-b' };
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: [rowA, rowB], error: null }),
          }),
        }),
      }),
    };

    await expect(
      resolveRegistrationRowForZeffyWebhook({
        supabase: supabase as never,
        paymentObject: { note: 'token-a and token-b' },
        payerEmailLower: ROW.email!,
        envelope: { blob: 'token-a token-b' },
        verifiedAmountCents: 25_000,
      }),
    ).resolves.toEqual({ ambiguous: true });
  });
});
