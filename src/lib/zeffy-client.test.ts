import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  coerceZeffyPaymentShape,
  extractEmailsDeep,
  extractWebhookPayment,
  trustedZeffyPaymentForPendingRegistration,
  zeffyFetchJson,
  zeffyFindContactIdByEmail,
  zeffyListPaymentsForContact,
  zeffyListRecentSucceededUsdPayments,
} from '@/lib/zeffy-client';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Zeffy payment list scoping', () => {
  it('filters reconciliation by conference campaign and registration time', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(JSON.stringify({ data: [], has_more: false }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await zeffyListRecentSucceededUsdPayments(
      { campaignId: 'campaign_ghana_2027', createdGteUnix: 1_777_809_300 },
      1,
    );

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('campaign')).toBe('campaign_ghana_2027');
    expect(url.searchParams.get('created[gte]')).toBe('1777809300');
    expect(url.searchParams.get('status')).toBe('succeeded');
  });

  it('wraps non-Error upstream failures', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject('offline')));
    await expect(
      trustedZeffyPaymentForPendingRegistration({
        email: 'ada@example.com',
        expectedUsd: 250,
      }),
    ).resolves.toEqual({ error: 'Zeffy API request failed.' });
  });

  it('surfaces Zeffy API failures instead of treating them as no payment', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'upstream unavailable' }), {
        status: 503,
      })),
    );

    await expect(
      trustedZeffyPaymentForPendingRegistration({
        email: 'ada@example.com',
        expectedUsd: 250,
        campaignId: 'campaign_ghana_2027',
      }),
    ).resolves.toEqual({ error: 'upstream unavailable' });
  });
});

describe('Zeffy helpers', () => {
  it('walks nested values while collecting emails', () => {
    const emails = new Set<string>();
    extractEmailsDeep(42, emails);
    extractEmailsDeep('not-an-email', emails);
    extractEmailsDeep({ ignored: null }, emails);
    extractEmailsDeep(['not-an-email', { deep: ['Ada@Example.com'] }], emails);
    expect(emails.has('ada@example.com')).toBe(true);
  });

  it('coerces nested numeric ids and invalid non-USD amounts', () => {
    expect(
      coerceZeffyPaymentShape({
        status: 'succeeded',
        currency: 'eur',
        payload: { payment_id: 99 },
        amount: Number.POSITIVE_INFINITY,
      }),
    ).toMatchObject({ id: '99', amountCents: null });
  });

  it('requires an API key', async () => {
    await expect(zeffyFetchJson('/payments')).rejects.toThrow(/Missing ZEFFY_API_KEY/);
    vi.stubEnv('ZEFFY_API_KEY', '   ');
    await expect(zeffyFetchJson('/payments')).rejects.toThrow(/Missing ZEFFY_API_KEY/);
  });

  it('passes search params and normalizes fetch paths', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      expect(href).toContain('payments');
      expect(href).toContain('email=ada%40example.com');
      return Response.json({ data: [] });
    });
    vi.stubGlobal('fetch', fetchImpl);
    await zeffyFetchJson('payments', { email: 'ada@example.com' });
  });

  it('treats empty API bodies as null JSON', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
    await expect(zeffyFetchJson('/payments')).resolves.toBeNull();
  });

  it('rejects invalid JSON bodies', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 200 })));
    await expect(zeffyFetchJson('/payments')).rejects.toThrow(/invalid JSON/);
  });

  it('falls back to the HTTP status when error bodies are empty', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(zeffyFetchJson('/payments')).rejects.toThrow(/503/);
  });

  it('uses raw response text when error JSON lacks a message', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"code":"upstream"}', { status: 502 })),
    );
    await expect(zeffyFetchJson('/payments')).rejects.toThrow(/upstream/);
  });

  it('extracts nested emails and coerces payment shapes', () => {
    const emails = new Set<string>();
    extractEmailsDeep({ nested: [{ buyer: 'Ada@Example.com' }] }, emails);
    expect(emails.has('ada@example.com')).toBe(true);

    expect(
      coerceZeffyPaymentShape({
        payment_id: 'pay_1',
        status: 'succeeded',
        amount_total: 250,
      }),
    ).toMatchObject({ id: 'pay_1', amountCents: 25_000 });

    expect(coerceZeffyPaymentShape({ id: '', amount: 1 })).toBeNull();
    expect(
      coerceZeffyPaymentShape({
        payment_id: 'from-payment-id',
        status: 'succeeded',
        amount: 100,
      }),
    ).toMatchObject({ id: 'from-payment-id' });
    expect(
      coerceZeffyPaymentShape({
        id: 42,
        status: 'succeeded',
        amount: 100,
      }),
    ).toMatchObject({ id: '42' });
  });

  it('extracts webhook payment objects from multiple envelope shapes', () => {
    expect(
      extractWebhookPayment({
        type: 'payment.completed',
        payment: { id: 'pay_1' },
      }),
    ).toEqual({ id: 'pay_1' });
    expect(
      extractWebhookPayment({
        event: 'payment',
        data: { payment_id: 'pay_2', amount: 100 },
      }),
    ).toMatchObject({ payment_id: 'pay_2' });
    expect(extractWebhookPayment({ type: 'other' })).toBeNull();
    expect(
      extractWebhookPayment({
        type: 'payment.updated',
        data: { payment_id: 'nested-only', amount: 1 },
      }),
    ).toMatchObject({ payment_id: 'nested-only' });
    expect(
      extractWebhookPayment({
        event: 'payment',
        data: { id: 'data-layer-id', amount: 1 },
      }),
    ).toMatchObject({ id: 'data-layer-id' });
    expect(extractWebhookPayment({ type: 'payment', data: 'not-an-object' })).toBeNull();
  });
});

describe('Zeffy contact and payment listing', () => {
  it('matches contacts by email when ids are nested', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          payments: [{ payment_id: 12345, status: 'succeeded', amount: 250, currency: 'usd' }],
          meta: { hasMore: false, next_cursor: 'next' },
        }),
      ),
    );
    await expect(zeffyListRecentSucceededUsdPayments({}, 1)).resolves.toHaveLength(1);
  });

  it('finds a contact id from the first successful query shape', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/contacts')) {
          return Response.json({ data: [{ contact_id: 'contact_1', email: 'ada@example.com' }] });
        }
        return Response.json({ data: [] });
      }),
    );

    await expect(zeffyFindContactIdByEmail('ada@example.com')).resolves.toBe('contact_1');
  });

  it('falls through to the email/id branch for whitespace ids', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [{ email: 'ada@example.com', id: '   ' }] })),
    );
    await expect(zeffyFindContactIdByEmail('ada@example.com')).resolves.toBe('');
  });

  it('matches contacts when the API returns email-first rows', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [{ email: 'ada@example.com', id: 'contact_email' }] })),
    );
    await expect(zeffyFindContactIdByEmail('ada@example.com')).resolves.toBe('contact_email');
  });

  it('throws when every contact lookup fails', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'denied' }, { status: 403 })),
    );
    await expect(zeffyFindContactIdByEmail('ada@example.com')).rejects.toThrow(/denied/);
  });

  it('paginates contact-scoped payments', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return Response.json({
            data: [{ id: 'pay_1', status: 'succeeded', amount: 250, currency: 'usd' }],
            has_more: true,
            next_cursor: 'cursor_2',
          });
        }
        return Response.json({ data: [{ id: 'pay_2', status: 'succeeded', amount: 250 }] });
      }),
    );

    const rows = await zeffyListPaymentsForContact('contact_1', { campaignId: 'camp', createdGteUnix: 10 });
    expect(rows).toHaveLength(2);
  });

  it('unwraps nested data arrays when listing recent payments', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          data: { data: [{ id: 'pay_nested', status: 'succeeded', amount: 100, currency: 'usd' }] },
        }),
      ),
    );
    await expect(zeffyListRecentSucceededUsdPayments({}, 1)).resolves.toHaveLength(1);
  });
});

describe('trustedZeffyPaymentForPendingRegistration matching', () => {
  it('accepts contact-scoped payments without embedded emails', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/contacts')) {
          return Response.json({ data: [{ id: 'contact_1' }] });
        }
        return Response.json({
          data: [{ id: 'pay_scoped', status: 'succeeded', amount: 250, currency: 'usd' }],
        });
      }),
    );

    await expect(
      trustedZeffyPaymentForPendingRegistration({
        email: 'ada@example.com',
        expectedUsd: 250,
      }),
    ).resolves.toMatchObject({ paymentId: 'pay_scoped' });
  });

  it('skips payments with the wrong email or status', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/contacts')) {
          return Response.json({ data: [] });
        }
        return Response.json({
          data: [
            { id: 'pay_bad_email', status: 'succeeded', amount: 250, currency: 'usd', email: 'other@example.com' },
            { id: 'pay_pending', status: 'pending', amount: 250, currency: 'usd', email: 'ada@example.com' },
            { id: 'pay_wrong_amount', status: 'succeeded', amount: 999, currency: 'usd', email: 'ada@example.com' },
          ],
        });
      }),
    );

    await expect(
      trustedZeffyPaymentForPendingRegistration({
        email: 'ada@example.com',
        expectedUsd: 250,
      }),
    ).resolves.toEqual({ notFoundReason: 'no_matching_payment_yet' });
  });

  it('matches a contact-scoped payment by amount and email', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/contacts')) {
          return Response.json({ data: [{ id: 'contact_1' }] });
        }
        return Response.json({
          data: [
            {
              id: 'pay_match',
              status: 'succeeded',
              amount: 250,
              currency: 'usd',
              buyer_email: 'ada@example.com',
              note: 'ADNA26-token',
            },
          ],
        });
      }),
    );

    await expect(
      trustedZeffyPaymentForPendingRegistration({
        email: 'ada@example.com',
        expectedUsd: 250,
        checkoutToken: 'ADNA26-token',
      }),
    ).resolves.toMatchObject({ paymentId: 'pay_match', amountCents: 25_000 });
  });

  it('reports ambiguous candidates and invalid totals', async () => {
    await expect(
      trustedZeffyPaymentForPendingRegistration({ email: 'ada@example.com', expectedUsd: 0 }),
    ).resolves.toEqual({ error: 'Invalid registration total.' });

    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/contacts')) {
          return Response.json({ data: [] });
        }
        return Response.json({
          data: [
            { id: 'pay_a', status: 'succeeded', amount: 250, currency: 'usd', email: 'ada@example.com' },
            { id: 'pay_b', status: 'succeeded', amount: 250, currency: 'usd', email: 'ada@example.com' },
          ],
        });
      }),
    );

    await expect(
      trustedZeffyPaymentForPendingRegistration({
        email: 'ada@example.com',
        expectedUsd: 250,
      }),
    ).resolves.toEqual({ notFoundReason: 'ambiguous_payment_candidates' });
  });

  it('returns notFoundReason when no payment matches yet', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/contacts')) {
          return Response.json({ data: [{ id: 'contact_1' }] });
        }
        return Response.json({
          data: [{ id: 'pay_other', status: 'succeeded', amount: 999, currency: 'usd', email: 'other@example.com' }],
        });
      }),
    );

    await expect(
      trustedZeffyPaymentForPendingRegistration({
        email: 'ada@example.com',
        expectedUsd: 250,
      }),
    ).resolves.toEqual({ notFoundReason: 'no_matching_payment_yet' });
  });

  it('truncates very long checkout tokens before matching', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    const longToken = `ADNA26-${'x'.repeat(300)}`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/contacts')) {
          return Response.json({ data: [] });
        }
        return Response.json({
          data: [
            {
              id: 'pay_long',
              status: 'succeeded',
              amount: 250,
              currency: 'usd',
              email: 'ada@example.com',
              memo: longToken.slice(0, 240),
            },
          ],
        });
      }),
    );

    await expect(
      trustedZeffyPaymentForPendingRegistration({
        email: 'ada@example.com',
        expectedUsd: 250,
        checkoutToken: longToken,
      }),
    ).resolves.toMatchObject({ paymentId: 'pay_long' });
  });
});

describe('Zeffy amount coercion details', () => {
  it('reads every amount hint shape', () => {
    for (const key of ['amount_total', 'total', 'amount', 'net_amount', 'total_amount'] as const) {
      expect(
        coerceZeffyPaymentShape({ id: 'hint', status: 'succeeded', currency: 'usd', [key]: 250 }),
      ).toMatchObject({ amountCents: 25_000 });
      expect(
        coerceZeffyPaymentShape({ id: 'hint', status: 'succeeded', currency: 'usd', [key]: '250.00' }),
      ).toMatchObject({ amountCents: 25_000 });
    }
  });

  it('handles alternate currencies, string amounts, and large integer USD values', () => {
    expect(
      coerceZeffyPaymentShape({ id: 'eur', status: 'succeeded', currency: 'eur', amount: 10 }),
    ).toMatchObject({ amountCents: 1000 });
    expect(
      coerceZeffyPaymentShape({ id: 'cents', status: 'succeeded', currency: 'usd', amount: 300_000 }),
    ).toMatchObject({ amountCents: 300_000 });
    expect(
      coerceZeffyPaymentShape({ id: 'str', status: 'succeeded', amount_total: '250.00' }),
    ).toMatchObject({ amountCents: 25_000 });
    expect(
      coerceZeffyPaymentShape({ id: 'float', status: 'succeeded', currency: 'usd', amount: 250.5 }),
    ).toMatchObject({ amountCents: 25_050 });
  });

  it('returns null for invalid magnitudes', () => {
    expect(coerceZeffyPaymentShape({ id: 'bad', status: 'succeeded', amount: 99_999_999, currency: 'usd' })).toMatchObject({
      amountCents: null,
    });
    expect(
      coerceZeffyPaymentShape({
        id: 'break',
        status: 'succeeded',
        currency: 'usd',
        amount: 250,
      }),
    ).toMatchObject({ amountCents: 25_000 });
  });
});

describe('Zeffy list helpers', () => {
  it('ignores email-only contacts without ids', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [{ email: 'ada@example.com' }] })),
    );
    await expect(zeffyFindContactIdByEmail('ada@example.com')).resolves.toBeNull();
  });

  it('returns null when contact lookup succeeds without results', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [null] })));
    await expect(zeffyFindContactIdByEmail('missing@example.com')).resolves.toBeNull();
  });

  it('skips null payment rows while paginating', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          data: [null, { id: 'pay_1', status: 'succeeded', amount: 250, currency: 'usd' }],
        }),
      ),
    );
    await expect(zeffyListRecentSucceededUsdPayments({}, 1)).resolves.toHaveLength(1);
  });

  it('defaults missing payment statuses to unknown', () => {
    expect(
      coerceZeffyPaymentShape({ id: 'pay_1', amount: 250, currency: 'usd' }),
    ).toMatchObject({ status: 'unknown' });
    expect(
      coerceZeffyPaymentShape({ id: 'pay_2', status: 'succeeded', amount_total: 250, currency: 'usd' }),
    ).toMatchObject({ amountCents: 25_000 });
  });

  it('matches contacts by email field when ids are absent', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [{ email: 'Ada@Example.com', id: 'contact-9' }] })),
    );
    await expect(zeffyFindContactIdByEmail('ada@example.com')).resolves.toBe('contact-9');
  });

  it('treats non-object payment envelopes as empty lists', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(null)));
    await expect(zeffyListRecentSucceededUsdPayments({}, 1)).resolves.toEqual([]);
  });

  it('stops paginating when has_more is true without a cursor', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          data: [{ id: 'pay_1', status: 'succeeded', amount: 250, currency: 'usd' }],
          has_more: true,
        }),
      ),
    );
    await expect(zeffyListRecentSucceededUsdPayments({}, 2)).resolves.toHaveLength(1);
  });

  it('paginates recent payments when cursors are present', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return Response.json({
            data: [{ id: 'pay_1', status: 'succeeded', amount: 250, currency: 'usd' }],
            has_more: true,
            next_cursor: 'cursor_2',
          });
        }
        return Response.json({ data: [{ id: 'pay_2', status: 'succeeded', amount: 250, currency: 'usd' }] });
      }),
    );
    await expect(
      zeffyListRecentSucceededUsdPayments({ campaignId: '  ', createdGteUnix: 10 }, 2),
    ).resolves.toHaveLength(2);
  });

  it('stops contact payment pagination without a cursor', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          data: [{ id: 'pay_1', status: 'succeeded', amount: 250, currency: 'usd' }],
          has_more: true,
        }),
      ),
    );
    await expect(zeffyListPaymentsForContact('contact_1')).resolves.toHaveLength(1);
  });

  it('skips null rows while paginating contact payments', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          data: [null, { id: 'pay_1', status: 'succeeded', amount: 250, currency: 'usd' }],
        }),
      ),
    );
    await expect(zeffyListPaymentsForContact('contact_1')).resolves.toHaveLength(1);
  });

  it('paginates contact payments across pages', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return Response.json({
            data: [{ id: 'pay_1', status: 'succeeded', amount: 250, currency: 'usd' }],
            has_more: true,
            next_cursor: 'cursor_2',
          });
        }
        return Response.json({ data: [{ id: 'pay_2', status: 'succeeded', amount: 250, currency: 'usd' }] });
      }),
    );
    await expect(zeffyListPaymentsForContact('contact_1')).resolves.toHaveLength(2);
  });

  it('matches contacts when only the email field is present', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [{ email: 'other@example.com' }] })),
    );
    await expect(zeffyFindContactIdByEmail('ada@example.com')).resolves.toBeNull();
  });

  it('accepts top-level payment arrays', async () => {
    vi.stubEnv('ZEFFY_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json([{ id: 'pay_array', status: 'succeeded', amount: 100, currency: 'usd' }]),
      ),
    );
    await expect(zeffyListRecentSucceededUsdPayments({}, 1)).resolves.toHaveLength(1);
  });
});
