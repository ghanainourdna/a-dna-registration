import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resolveZeffyCheckoutBaseUrl,
  zeffyShouldRouteToStudentCampaign,
} from '@/lib/zeffy-checkout-urls';

const FALLBACK = 'https://www.zeffy.com/en-US/ticketing/fallback';
const VIRTUAL_URL = 'https://www.zeffy.com/en-US/ticketing/virtual';
const STUDENT_CAMPAIGN = 'https://www.zeffy.com/en-US/ticketing/students';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('zeffyShouldRouteToStudentCampaign', () => {
  it('does not send virtual registrations to the student campaign', () => {
    expect(
      zeffyShouldRouteToStudentCampaign({
        is_student: true,
        registration_type: 'virtual',
      }),
    ).toBe(false);
    expect(
      zeffyShouldRouteToStudentCampaign({
        is_student: false,
        registration_type: 'virtual',
      }),
    ).toBe(false);
  });

  it('still routes in-person student tiers to the student campaign', () => {
    expect(
      zeffyShouldRouteToStudentCampaign({
        is_student: true,
        registration_type: 'student_conference',
      }),
    ).toBe(true);
    expect(
      zeffyShouldRouteToStudentCampaign({
        is_student: false,
        registration_type: 'conference_and_reception_student',
      }),
    ).toBe(true);
  });
});

describe('resolveZeffyCheckoutBaseUrl', () => {
  it('sends student + virtual to ZEFFY_CHECKOUT_URL_VIRTUAL, not the student campaign', () => {
    vi.stubEnv('ZEFFY_CHECKOUT_URL_VIRTUAL', VIRTUAL_URL);
    vi.stubEnv('NEXT_PUBLIC_ZEFFY_STUDENT_CHECKOUT_URL', STUDENT_CAMPAIGN);
    vi.stubEnv('ZEFFY_CHECKOUT_URL_STUDENT_CONFERENCE', STUDENT_CAMPAIGN);

    expect(
      resolveZeffyCheckoutBaseUrl(
        { is_student: true, registration_type: 'virtual' },
        FALLBACK,
      ),
    ).toBe(VIRTUAL_URL);
  });

  it('falls back to the generic campaign when virtual URL is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_ZEFFY_STUDENT_CHECKOUT_URL', STUDENT_CAMPAIGN);

    expect(
      resolveZeffyCheckoutBaseUrl(
        { is_student: true, registration_type: 'virtual' },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it('still routes student conference to the student campaign', () => {
    vi.stubEnv('ZEFFY_CHECKOUT_URL_VIRTUAL', VIRTUAL_URL);
    vi.stubEnv('NEXT_PUBLIC_ZEFFY_STUDENT_CHECKOUT_URL', STUDENT_CAMPAIGN);

    expect(
      resolveZeffyCheckoutBaseUrl(
        { is_student: true, registration_type: 'student_conference' },
        FALLBACK,
      ),
    ).toBe(STUDENT_CAMPAIGN);
  });
});
