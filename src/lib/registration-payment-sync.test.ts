import { describe, expect, it, vi } from 'vitest';

import type { RegistrationPaymentRow } from '@/lib/registration-payment-finalize';
import {
  clampPendingPaymentSyncLimit,
  syncOneRegistrationPaymentFromZeffy,
  syncPendingRegistrationPaymentsFromZeffy,
} from '@/lib/registration-payment-sync';

function pendingRow(overrides: Partial<RegistrationPaymentRow> = {}): RegistrationPaymentRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'ada@example.com',
    registration_type: 'diaspora_nurses_allied_health',
    needs_housing: false,
    room_type: null,
    occupancy_type: null,
    registration_amount: 100,
    housing_amount: 0,
    total_amount: 100,
    payment_status: 'pending',
    checkout_correlation_reference: 'ADNA26-token',
    conference_id: '22222222-2222-2222-2222-222222222222',
    created_at: '2026-09-02T12:00:00.000Z',
    payment_sync_checked_at: null,
    ...overrides,
  };
}

describe('clampPendingPaymentSyncLimit', () => {
  it('defaults, clamps, and parses query strings', () => {
    expect(clampPendingPaymentSyncLimit(undefined)).toBe(10);
    expect(clampPendingPaymentSyncLimit(0)).toBe(1);
    expect(clampPendingPaymentSyncLimit(500)).toBe(25);
    expect(clampPendingPaymentSyncLimit('15')).toBe(15);
  });
});

describe('syncOneRegistrationPaymentFromZeffy', () => {
  it('marks a matching Zeffy payment as paid and sends confirmation', async () => {
    const sendConfirmation = vi.fn(async () => true);
    const finalize = vi.fn(async () => ({
      outcome: 'paid' as const,
      registrationId: pendingRow().id,
    }));
    const matchPayment = vi.fn(async () => ({
      paymentId: 'pay_123',
      status: 'succeeded',
      amountCents: 10000,
      currencyLower: 'usd',
    }));

    const result = await syncOneRegistrationPaymentFromZeffy(
      {} as never,
      pendingRow(),
      {
        matchPayment,
        finalize,
        sendConfirmation,
        resolvePaymentScope: async () => ({
          campaignId: 'campaign_ghana_2027',
          createdGteUnix: 1_777_809_300,
        }),
      },
    );

    expect(result).toMatchObject({
      outcome: 'paid',
      providerPaymentId: 'pay_123',
      alreadyPaid: false,
    });
    expect(finalize).toHaveBeenCalledOnce();
    expect(matchPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'campaign_ghana_2027',
        createdGteUnix: 1_777_809_300,
      }),
    );
    expect(sendConfirmation).toHaveBeenCalledWith({}, pendingRow().id);
  });

  it('leaves the row pending when Zeffy has no matching payment yet', async () => {
    const result = await syncOneRegistrationPaymentFromZeffy({} as never, pendingRow(), {
      matchPayment: async () => ({ notFoundReason: 'no_matching_payment_yet' }),
      finalize: vi.fn(),
      sendConfirmation: vi.fn(),
      resolvePaymentScope: async () => ({ createdGteUnix: 1_777_809_300 }),
    });

    expect(result).toEqual({
      outcome: 'pending',
      registrationId: pendingRow().id,
      amountUsd: 100,
      reason: 'no_matching_payment_yet',
    });
  });
});

describe('syncPendingRegistrationPaymentsFromZeffy', () => {
  it('walks pending rows and counts paid vs still-pending', async () => {
    const paid = pendingRow({ id: 'paid-1', email: 'paid@example.com' });
    const waiting = pendingRow({ id: 'wait-1', email: 'wait@example.com', total_amount: 200 });

    const orderCalls: Array<{ column: string; options: unknown }> = [];
    const supabase = {
      from: () => ({
        select: (columns: string) => {
          if (columns === 'id') {
            return {
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }
          return {
            eq: () => ({
              or: () => {
                const ordered = {
                  order: (column: string, options: unknown) => {
                    orderCalls.push({ column, options });
                    return ordered;
                  },
                  limit: async () => ({ data: [paid, waiting], error: null }),
                };
                return ordered;
              },
            }),
          };
        },
        update: () => ({
          in: async () => ({ error: null }),
        }),
      }),
    };

    const matchPayment = vi.fn(async (opts: { email: string }) => {
      if (opts.email === 'paid@example.com') {
        return {
          paymentId: 'pay_paid',
          status: 'succeeded',
          amountCents: 10000,
          currencyLower: 'usd',
        };
      }
      return { notFoundReason: 'no_matching_payment_yet' };
    });
    const finalize = vi.fn(async (_sb: unknown, row: RegistrationPaymentRow) => ({
      outcome: 'paid' as const,
      registrationId: row.id,
    }));
    const sendConfirmation = vi.fn(async () => true);

    const summary = await syncPendingRegistrationPaymentsFromZeffy(
      supabase as never,
      { limit: 50 },
      {
        matchPayment,
        finalize,
        sendConfirmation,
        resolvePaymentScope: async () => ({ createdGteUnix: 1_777_809_300 }),
      },
    );

    expect(summary).toEqual({
      checked: 2,
      paid: 1,
      pending: 1,
      rejected: 0,
      confirmationRetriesChecked: 0,
      confirmationRetriesSent: 0,
      confirmationRetriesFailed: 0,
      errors: [],
    });
    expect(finalize).toHaveBeenCalledOnce();
    expect(sendConfirmation).toHaveBeenCalledWith(supabase, 'paid-1');
    expect(orderCalls).toEqual([
      {
        column: 'payment_sync_checked_at',
        options: { ascending: true, nullsFirst: true },
      },
      { column: 'created_at', options: { ascending: false } },
    ]);
  });

  it('retries confirmation emails for paid rows that remain unsent', async () => {
    const supabase = {
      from: () => ({
        select: (columns: string) => {
          if (columns === 'id') {
            return {
              eq: () => ({
                is: () => ({
                  order: () => ({
                    limit: async () => ({ data: [{ id: 'retry-1' }], error: null }),
                  }),
                }),
              }),
            };
          }
          return {
            eq: () => ({
              or: () => {
                const ordered = {
                  order: () => ordered,
                  limit: async () => ({ data: [], error: null }),
                };
                return ordered;
              },
            }),
          };
        },
      }),
    };
    const sendConfirmation = vi.fn(async () => true);

    const summary = await syncPendingRegistrationPaymentsFromZeffy(
      supabase as never,
      {},
      {
        matchPayment: vi.fn(),
        finalize: vi.fn(),
        sendConfirmation,
        resolvePaymentScope: vi.fn(),
      },
    );

    expect(summary).toMatchObject({
      checked: 0,
      confirmationRetriesChecked: 1,
      confirmationRetriesSent: 1,
      confirmationRetriesFailed: 0,
      errors: [],
    });
    expect(sendConfirmation).toHaveBeenCalledWith(supabase, 'retry-1');
  });
});
