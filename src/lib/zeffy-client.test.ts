import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  trustedZeffyPaymentForPendingRegistration,
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
