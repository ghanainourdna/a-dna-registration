import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RegistrationTier } from '@/lib/pricing';
import {
  resolveZeffyCheckoutBaseUrl,
  zeffyCheckoutUrlForTier,
  zeffyShouldRouteToStudentCampaign,
  ZEFFY_STUDENT_TICKETING_DEFAULT,
  zeffyStudentCampaignCheckoutUrl,
} from '@/lib/zeffy-checkout-urls';

const ALL_TIERS: RegistrationTier[] = [
  'conference_only',
  'student_conference',
  'reception_only',
  'conference_and_reception',
  'conference_and_reception_student',
  'virtual',
  'diaspora_nurses_allied_health',
  'diaspora_physicians',
  'diaspora_student',
  'low_moderate_income_nurses_allied_health',
  'low_moderate_income_nurses_allied_health_student',
  'low_moderate_income_physician',
  'reception',
  'african_students',
  'reception_dinner',
  'african_physicians_allied',
  'african_nurses_midwives',
];

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

  it('skips student routing when is_student is omitted', () => {
    expect(
      resolveZeffyCheckoutBaseUrl({ registration_type: 'conference_only' }, FALLBACK),
    ).toBe(FALLBACK);
  });

  it('falls back to the campaign URL when a tier URL is unset', () => {
    expect(
      resolveZeffyCheckoutBaseUrl(
        { registration_type: 'reception' },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
    expect(resolveZeffyCheckoutBaseUrl({ registration_type: 'virtual' }, FALLBACK)).toBe(FALLBACK);
  });

  it('routes students and virtual tiers to dedicated checkout URLs', () => {
    vi.stubEnv('NEXT_PUBLIC_ZEFFY_STUDENT_CHECKOUT_URL', 'https://student.example');
    vi.stubEnv('ZEFFY_CHECKOUT_URL_VIRTUAL', 'https://virtual.example');

    expect(
      resolveZeffyCheckoutBaseUrl(
        { is_student: true, registration_type: 'conference_only' },
        FALLBACK,
      ),
    ).toBe('https://student.example');
    expect(
      resolveZeffyCheckoutBaseUrl({ registration_type: 'virtual' }, FALLBACK),
    ).toBe('https://virtual.example');
    expect(zeffyStudentCampaignCheckoutUrl()).toBe('https://student.example');
    expect(zeffyCheckoutUrlForTier('virtual')).toBe('https://virtual.example');
  });

  it('covers every tier env lookup and student routing decision', () => {
    expect(zeffyStudentCampaignCheckoutUrl()).toBe(ZEFFY_STUDENT_TICKETING_DEFAULT);
    for (const tier of ALL_TIERS) {
      vi.stubEnv(`ZEFFY_CHECKOUT_URL_${tier.toUpperCase()}`, `https://example.test/${tier}`);
      expect(zeffyCheckoutUrlForTier(tier)).toBe(`https://example.test/${tier}`);
      zeffyShouldRouteToStudentCampaign({ is_student: true, registration_type: tier });
      zeffyShouldRouteToStudentCampaign({ is_student: false, registration_type: tier });
    }
  });

  it('decides student-campaign routing from tier and is_student', () => {
    expect(zeffyShouldRouteToStudentCampaign({ is_student: true, registration_type: 'conference_only' })).toBe(
      true,
    );
    expect(
      zeffyShouldRouteToStudentCampaign({ is_student: false, registration_type: 'student_conference' }),
    ).toBe(true);
    expect(zeffyShouldRouteToStudentCampaign({ is_student: false, registration_type: 'virtual' })).toBe(
      false,
    );
    expect(
      zeffyShouldRouteToStudentCampaign({ is_student: false, registration_type: 'diaspora_physicians' }),
    ).toBe(false);
  });
});
