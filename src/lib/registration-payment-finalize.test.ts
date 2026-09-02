import { describe, expect, it, vi } from 'vitest';

import {
  finalizeRegistrationPaymentForRow,
  resolveRegistrationRowForZeffyWebhook,
  type RegistrationPaymentRow,
} from '@/lib/registration-payment-finalize';

const ROW: RegistrationPaymentRow = {
  id: '11111111-1111-1111-1111-111111111111',
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

describe('finalizeRegistrationPaymentForRow', () => {
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
  function lookupSupabase() {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: [ROW], error: null }),
          }),
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
});
