import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveZeffyCheckoutBaseUrl } from '@/lib/zeffy-checkout-urls';

const FALLBACK = 'https://www.zeffy.com/en-US/ticketing/campaign';
const NURSES_URL = 'https://www.zeffy.com/en-US/ticketing/nurses';
const PHYSICIANS_URL = 'https://www.zeffy.com/en-US/ticketing/physicians';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveZeffyCheckoutBaseUrl', () => {
  it('uses the per-tier checkout URL when configured', () => {
    vi.stubEnv('ZEFFY_CHECKOUT_URL_DIASPORA_NURSES_ALLIED_HEALTH', NURSES_URL);
    vi.stubEnv('ZEFFY_CHECKOUT_URL_DIASPORA_PHYSICIANS', PHYSICIANS_URL);

    expect(
      resolveZeffyCheckoutBaseUrl(
        { registration_type: 'diaspora_nurses_allied_health' },
        FALLBACK,
      ),
    ).toBe(NURSES_URL);
    expect(
      resolveZeffyCheckoutBaseUrl(
        { registration_type: 'diaspora_physicians' },
        FALLBACK,
      ),
    ).toBe(PHYSICIANS_URL);
  });

  it('falls back to the campaign URL when a tier URL is unset', () => {
    expect(
      resolveZeffyCheckoutBaseUrl(
        { registration_type: 'reception' },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });
});
