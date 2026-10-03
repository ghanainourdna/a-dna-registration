import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PAYSTACK_SHOP_URLS,
  paystackCheckoutUrlForTier,
  paystackStudentCheckoutUrl,
  resolvePaystackCheckoutBaseUrl,
} from '@/lib/paystack-checkout-urls';
import type { RegistrationTier } from '@/lib/pricing';

afterEach(() => {
  vi.unstubAllEnvs();
});

const GHANA_CATEGORY_LINKS: Array<{
  registration_type: RegistrationTier;
  url: string;
}> = [
  {
    registration_type: 'diaspora_nurses_allied_health',
    url: 'https://paystack.shop/pay/e-75uj2uyb',
  },
  {
    registration_type: 'diaspora_physicians',
    url: 'https://paystack.shop/pay/e5tqqeg1xn',
  },
  {
    registration_type: 'low_moderate_income_nurses_allied_health',
    url: 'https://paystack.shop/pay/ewnjxj2xek',
  },
  {
    registration_type: 'reception',
    url: 'https://paystack.shop/pay/64om8fbkou',
  },
];

describe('PAYSTACK_SHOP_URLS', () => {
  it('keeps the hosted shop slugs from the category list', () => {
    expect(PAYSTACK_SHOP_URLS.africanNursesMidwives).toBe(
      'https://paystack.shop/pay/e-75uj2uyb',
    );
    expect(PAYSTACK_SHOP_URLS.africanPhysiciansAlliedHealth).toBe(
      'https://paystack.shop/pay/e5tqqeg1xn',
    );
    expect(PAYSTACK_SHOP_URLS.africanStudents).toBe('https://paystack.shop/pay/ewnjxj2xek');
    expect(PAYSTACK_SHOP_URLS.receptionDinner).toBe('https://paystack.shop/pay/64om8fbkou');
  });
});

describe('paystackCheckoutUrlForTier', () => {
  it.each(GHANA_CATEGORY_LINKS)(
    'defaults $registration_type to its shop page',
    ({ registration_type, url }) => {
      expect(paystackCheckoutUrlForTier(registration_type)).toBe(url);
    },
  );

  it('returns undefined for USA tiers that have no Ghana shop page', () => {
    expect(paystackCheckoutUrlForTier('conference_only')).toBeUndefined();
    expect(paystackCheckoutUrlForTier('virtual')).toBeUndefined();
  });

  it('prefers a per-tier env override over the default shop page', () => {
    vi.stubEnv(
      'PAYSTACK_CHECKOUT_URL_DIASPORA_NURSES_ALLIED_HEALTH',
      'https://paystack.shop/pay/nurses-override',
    );
    expect(paystackCheckoutUrlForTier('diaspora_nurses_allied_health')).toBe(
      'https://paystack.shop/pay/nurses-override',
    );
    expect(paystackCheckoutUrlForTier('diaspora_physicians')).toBe(
      PAYSTACK_SHOP_URLS.africanPhysiciansAlliedHealth,
    );
  });
});

describe('paystackStudentCheckoutUrl', () => {
  it('defaults to the African Students shop page', () => {
    expect(paystackStudentCheckoutUrl()).toBe(PAYSTACK_SHOP_URLS.africanStudents);
  });

  it('uses PAYSTACK_CHECKOUT_URL_AFRICAN_STUDENTS when set', () => {
    vi.stubEnv(
      'PAYSTACK_CHECKOUT_URL_AFRICAN_STUDENTS',
      'https://paystack.shop/pay/students-override',
    );
    expect(paystackStudentCheckoutUrl()).toBe('https://paystack.shop/pay/students-override');
  });
});

describe('resolvePaystackCheckoutBaseUrl', () => {
  it.each(GHANA_CATEGORY_LINKS)(
    'routes a non-student $registration_type to $url',
    ({ registration_type, url }) => {
      expect(
        resolvePaystackCheckoutBaseUrl({
          is_student: false,
          registration_type,
        }),
      ).toBe(url);
    },
  );

  it('sends each Africa catalog ticket to its own shop page', () => {
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: false,
        registration_type: 'african_nurses_midwives',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanNursesMidwives);
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: false,
        registration_type: 'african_physicians_allied',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanPhysiciansAlliedHealth);
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: true,
        registration_type: 'african_students',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanStudents);
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: false,
        registration_type: 'reception_dinner',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.receptionDinner);
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: true,
        registration_type: 'african_physicians_allied',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanPhysiciansAlliedHealth);
  });

  it('sends students to the African Students page for legacy conference tickets', () => {
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: true,
        registration_type: 'diaspora_nurses_allied_health',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanStudents);
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: true,
        registration_type: 'diaspora_physicians',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanStudents);
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: true,
        registration_type: 'low_moderate_income_nurses_allied_health',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanStudents);
  });

  it('keeps reception on the reception dinner page for students', () => {
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: true,
        registration_type: 'reception',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.receptionDinner);
  });

  it('returns null for USA tiers so initialize can use the Paystack API', () => {
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: false,
        registration_type: 'conference_only',
      }),
    ).toBeNull();
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: true,
        registration_type: 'student_conference',
      }),
    ).toBeNull();
  });

  it('honors env overrides for reception and student shop pages', () => {
    vi.stubEnv('PAYSTACK_CHECKOUT_URL_RECEPTION', 'https://paystack.shop/pay/reception-override');
    vi.stubEnv(
      'PAYSTACK_CHECKOUT_URL_AFRICAN_STUDENTS',
      'https://paystack.shop/pay/students-override',
    );

    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: false,
        registration_type: 'reception',
      }),
    ).toBe('https://paystack.shop/pay/reception-override');
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: true,
        registration_type: 'diaspora_physicians',
      }),
    ).toBe('https://paystack.shop/pay/students-override');
  });
});
