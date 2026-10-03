import { describe, expect, it } from 'vitest';

import { isAfricanCountryCode } from '@/lib/countries/africa';
import {
  PAYSTACK_SHOP_URLS,
  resolvePaystackCheckoutBaseUrl,
} from '@/lib/paystack-checkout-urls';
import { shouldUsePaystackCheckout } from '@/lib/paystack';
import {
  AFRICA_REGISTRATION_TIERS,
  defaultRegistrationTierForAttendee,
  registrationTiersForAttendee,
  registrationTiersForConference,
} from '@/lib/pricing';

describe('Ghana checkout routing', () => {
  it('treats Ghana as an African Paystack country', () => {
    expect(isAfricanCountryCode('GH')).toBe(true);
    expect(shouldUsePaystackCheckout('GH')).toBe(true);
    expect(shouldUsePaystackCheckout('gh')).toBe(true);
  });

  it('shows the Africa Paystack catalog for Ghana and other African countries', () => {
    expect(registrationTiersForAttendee('ghana-2027', false, 'GH')).toEqual([
      ...AFRICA_REGISTRATION_TIERS,
    ]);
    expect(registrationTiersForAttendee('ghana-2027', true, 'NG')).toEqual([
      ...AFRICA_REGISTRATION_TIERS,
    ]);
    expect(defaultRegistrationTierForAttendee('ghana-2027', false, 'GH')).toBe(
      'african_nurses_midwives',
    );
    expect(defaultRegistrationTierForAttendee('ghana-2027', true, 'GH')).toBe(
      'african_students',
    );
  });

  it('keeps diaspora tickets for attendees outside Africa', () => {
    expect(registrationTiersForConference('ghana-2027', false)).toEqual([
      'diaspora_nurses_allied_health',
      'diaspora_physicians',
      'low_moderate_income_nurses_allied_health',
      'low_moderate_income_physician',
      'reception',
    ]);
    expect(registrationTiersForAttendee('ghana-2027', false, 'US')).toEqual(
      registrationTiersForConference('ghana-2027', false),
    );
    expect(registrationTiersForAttendee('ghana-2027', true, 'US')).toEqual([
      'diaspora_nurses_allied_health',
      'diaspora_physicians',
      'diaspora_student',
      'low_moderate_income_nurses_allied_health',
      'low_moderate_income_nurses_allied_health_student',
      'low_moderate_income_physician',
      'reception',
    ]);
    expect(registrationTiersForAttendee('ghana-2027', true, 'US')).not.toContain(
      'african_students',
    );
  });

  it('maps each Ghana ticket to its Paystack Shop page', () => {
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: false,
        registration_type: 'diaspora_nurses_allied_health',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanNursesMidwives);
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: false,
        registration_type: 'diaspora_physicians',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanPhysiciansAlliedHealth);
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: false,
        registration_type: 'low_moderate_income_nurses_allied_health',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanStudents);
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: false,
        registration_type: 'reception',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.receptionDinner);
  });

  it('sends a Ghana student to the African Students shop unless they chose reception', () => {
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: true,
        registration_type: defaultRegistrationTierForAttendee('ghana-2027', true, 'GH'),
      }),
    ).toBe(PAYSTACK_SHOP_URLS.africanStudents);
    expect(
      resolvePaystackCheckoutBaseUrl({
        is_student: true,
        registration_type: 'reception',
      }),
    ).toBe(PAYSTACK_SHOP_URLS.receptionDinner);
  });
});
