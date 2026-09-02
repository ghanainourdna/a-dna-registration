import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildPaidRegistrationConfirmation,
  canClaimConfirmationEmail,
  CONFIRMATION_EMAIL_CLAIM_LEASE_MS,
  deliverPaidRegistrationConfirmationWithClaim,
  paidRegistrationEmailSubject,
  sendPaidRegistrationConfirmationIfNeeded,
  type PaidRegistrationEmailRow,
} from '@/lib/email/send-registration-confirmation';

afterEach(() => {
  vi.unstubAllEnvs();
});

const PAID_ROW: PaidRegistrationEmailRow = {
  id: '11111111-1111-1111-1111-111111111111',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  registration_type: 'diaspora_nurses_allied_health',
  total_amount: 250,
};

type StoreRow = PaidRegistrationEmailRow & {
  payment_status: 'pending' | 'paid' | 'failed';
  confirmation_email_sent_at: string | null;
  confirmation_email_claimed_at: string | null;
  confirmation_email_claim_token: string | null;
};

function createMemoryConfirmationEmailStore(initial: StoreRow, clock: { now: Date }) {
  const row: StoreRow = { ...initial };
  let queue = Promise.resolve();

  const serialize = <T>(fn: () => T): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const rpc = async (name: string, args: Record<string, unknown>) => {
    return serialize(() => {
      const now = clock.now;
      if (name === 'claim_registration_confirmation_email_send') {
        if (args.p_registration_id !== row.id) return { data: null, error: null };
        if (!canClaimConfirmationEmail(row, now)) return { data: null, error: null };
        const token = crypto.randomUUID();
        row.confirmation_email_claimed_at = now.toISOString();
        row.confirmation_email_claim_token = token;
        return { data: token, error: null };
      }
      if (name === 'mark_registration_confirmation_email_sent') {
        if (
          args.p_registration_id !== row.id ||
          args.p_claim_token !== row.confirmation_email_claim_token ||
          row.confirmation_email_sent_at
        ) {
          return { data: false, error: null };
        }
        row.confirmation_email_sent_at = now.toISOString();
        row.confirmation_email_claimed_at = null;
        row.confirmation_email_claim_token = null;
        return { data: true, error: null };
      }
      if (name === 'clear_registration_confirmation_email_claim') {
        if (
          args.p_registration_id !== row.id ||
          args.p_claim_token !== row.confirmation_email_claim_token ||
          row.confirmation_email_sent_at
        ) {
          return { data: false, error: null };
        }
        row.confirmation_email_claimed_at = null;
        row.confirmation_email_claim_token = null;
        return { data: true, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${name}` } };
    });
  };

  const from = () => ({
    select: () => ({
      eq: (column: string, value: string) => ({
        maybeSingle: async () => {
          if (column === 'id' && value === row.id) {
            return { data: { ...row }, error: null };
          }
          return { data: null, error: null };
        },
      }),
    }),
  });

  return { row, rpc, from };
}

describe('paid registration confirmation email', () => {
  it('confirms payment instead of asking the user to pay', () => {
    const content = buildPaidRegistrationConfirmation(PAID_ROW);

    expect(content.subject).toBe(paidRegistrationEmailSubject());
    expect(content.subject).toMatch(/confirmed/i);
    expect(content.text).toMatch(/payment has been received/i);
    expect(content.text).toMatch(/registration is confirmed/i);
    expect(content.text).not.toMatch(/complete payment/i);
    expect(content.text).not.toMatch(/Zeffy from the registration page/i);
    expect(content.totalPaid).toBe('$250.00 USD');
    expect(content.tierLabel).toBe(
      '$250 - Diaspora Nurses, Midwives and Allied Health',
    );
  });

  it('uses the conference title when provided', () => {
    const content = buildPaidRegistrationConfirmation({
      ...PAID_ROW,
      event_title: 'A-DNA Global Conference Ghana 2027',
    });
    expect(content.subject).toMatch(/Ghana 2027/);
    expect(content.text).toMatch(/Ghana 2027/);
  });

  it('includes a success-page link when NEXT_PUBLIC_APP_URL is set', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://register.example.org/');

    const content = buildPaidRegistrationConfirmation({
      ...PAID_ROW,
      id: 'reg-456',
      registration_type: 'diaspora_physicians',
      total_amount: '350.00',
    });

    expect(content.detailsUrl).toBe(
      'https://register.example.org/register/success?registration_id=reg-456',
    );
    expect(content.text).toContain(content.detailsUrl);
  });

  it('does not claim a send when RESEND_API_KEY is unset', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const from = vi.fn();
    const rpc = vi.fn();
    const supabase = { from, rpc };

    await expect(
      sendPaidRegistrationConfirmationIfNeeded(supabase as never, PAID_ROW.id),
    ).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('canClaimConfirmationEmail', () => {
  const now = new Date('2026-08-13T23:00:00.000Z');

  it('allows a paid registration that has never been claimed or sent', () => {
    expect(
      canClaimConfirmationEmail(
        {
          payment_status: 'paid',
          confirmation_email_sent_at: null,
          confirmation_email_claimed_at: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it('rejects a row that is already marked sent', () => {
    expect(
      canClaimConfirmationEmail(
        {
          payment_status: 'paid',
          confirmation_email_sent_at: now.toISOString(),
          confirmation_email_claimed_at: null,
        },
        now,
      ),
    ).toBe(false);
  });

  it('rejects an active (non-stale) claim', () => {
    expect(
      canClaimConfirmationEmail(
        {
          payment_status: 'paid',
          confirmation_email_sent_at: null,
          confirmation_email_claimed_at: new Date(now.getTime() - 60_000).toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });

  it('allows reclaiming a stale claim so a crash between claim and send can retry', () => {
    expect(
      canClaimConfirmationEmail(
        {
          payment_status: 'paid',
          confirmation_email_sent_at: null,
          confirmation_email_claimed_at: new Date(
            now.getTime() - CONFIRMATION_EMAIL_CLAIM_LEASE_MS,
          ).toISOString(),
        },
        now,
      ),
    ).toBe(true);
  });
});

describe('deliverPaidRegistrationConfirmationWithClaim', () => {
  it('sets sent_at only after the email send succeeds', async () => {
    const clock = { now: new Date('2026-08-13T23:00:00.000Z') };
    const store = createMemoryConfirmationEmailStore(
      {
        ...PAID_ROW,
        payment_status: 'paid',
        confirmation_email_sent_at: null,
        confirmation_email_claimed_at: null,
        confirmation_email_claim_token: null,
      },
      clock,
    );
    const send = vi.fn(async () => {
      expect(store.row.confirmation_email_sent_at).toBeNull();
      expect(store.row.confirmation_email_claim_token).toBeTruthy();
      return true;
    });

    await expect(
      deliverPaidRegistrationConfirmationWithClaim(store as never, PAID_ROW.id, send),
    ).resolves.toBe(true);

    expect(send).toHaveBeenCalledOnce();
    expect(store.row.confirmation_email_sent_at).toBe(clock.now.toISOString());
    expect(store.row.confirmation_email_claimed_at).toBeNull();
    expect(store.row.confirmation_email_claim_token).toBeNull();
  });

  it('releases the claim when send fails so a later caller can retry immediately', async () => {
    const clock = { now: new Date('2026-08-13T23:00:00.000Z') };
    const store = createMemoryConfirmationEmailStore(
      {
        ...PAID_ROW,
        payment_status: 'paid',
        confirmation_email_sent_at: null,
        confirmation_email_claimed_at: null,
        confirmation_email_claim_token: null,
      },
      clock,
    );

    await expect(
      deliverPaidRegistrationConfirmationWithClaim(store as never, PAID_ROW.id, async () => false),
    ).resolves.toBe(false);

    expect(store.row.confirmation_email_sent_at).toBeNull();
    expect(store.row.confirmation_email_claimed_at).toBeNull();
    expect(store.row.confirmation_email_claim_token).toBeNull();
  });

  it('lets a later caller reclaim after a crash between claim and send once the lease expires', async () => {
    const clock = { now: new Date('2026-08-13T23:00:00.000Z') };
    const store = createMemoryConfirmationEmailStore(
      {
        ...PAID_ROW,
        payment_status: 'paid',
        confirmation_email_sent_at: null,
        confirmation_email_claimed_at: null,
        confirmation_email_claim_token: null,
      },
      clock,
    );

    const hang = new Promise<boolean>(() => {
      /* never resolves - process died after claim */
    });
    void deliverPaidRegistrationConfirmationWithClaim(store as never, PAID_ROW.id, () => hang);

    await vi.waitFor(() => {
      expect(store.row.confirmation_email_claim_token).toBeTruthy();
    });
    expect(store.row.confirmation_email_sent_at).toBeNull();

    clock.now = new Date(clock.now.getTime() + CONFIRMATION_EMAIL_CLAIM_LEASE_MS);
    const send = vi.fn(async () => true);

    await expect(
      deliverPaidRegistrationConfirmationWithClaim(store as never, PAID_ROW.id, send),
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(store.row.confirmation_email_sent_at).toBeTruthy();
  });

  it('gives exactly one concurrent caller the claim so only one email is sent', async () => {
    const clock = { now: new Date('2026-08-13T23:00:00.000Z') };
    const store = createMemoryConfirmationEmailStore(
      {
        ...PAID_ROW,
        payment_status: 'paid',
        confirmation_email_sent_at: null,
        confirmation_email_claimed_at: null,
        confirmation_email_claim_token: null,
      },
      clock,
    );

    let releaseFirstSend!: (value: boolean) => void;
    let resolveFirstSendStarted!: () => void;
    const firstSendStarted = new Promise<void>((resolve) => {
      resolveFirstSendStarted = resolve;
    });
    const send = vi.fn(async () => {
      resolveFirstSendStarted();
      return new Promise<boolean>((resolve) => {
        releaseFirstSend = resolve;
      });
    });

    const first = deliverPaidRegistrationConfirmationWithClaim(store as never, PAID_ROW.id, send);
    await firstSendStarted;

    const second = deliverPaidRegistrationConfirmationWithClaim(store as never, PAID_ROW.id, send);
    await expect(second).resolves.toBe(false);

    releaseFirstSend(true);
    await expect(first).resolves.toBe(true);

    expect(send).toHaveBeenCalledOnce();
    expect(store.row.confirmation_email_sent_at).toBeTruthy();
  });
});
