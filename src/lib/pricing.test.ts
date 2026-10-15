import { describe, expect, it } from 'vitest';

import {
  centsFromUsd,
  defaultRegistrationTierForAttendee,
  defaultRegistrationTierForConference,
  formatRegistrationAmount,
  housingAmountUsd,
  getConferenceRegistrationConfig,
  totalAmountUsd,
  hasConferenceRegistrationConfig,
  isRegistrationTierAllowedForConference,
  registrationTiersForAttendee,
  registrationTiersForConference,
  usesAfricaRegistrationCatalog,
  usdFromCents,
} from '@/lib/pricing';

describe('conference registration tiers', () => {
  it('keeps Ghana and historical USA ticket catalogs separate', () => {
    expect(registrationTiersForConference('ghana-2027', false)).toContain(
      'diaspora_nurses_allied_health',
    );
    expect(registrationTiersForConference('ghana-2027', false)).not.toContain(
      'conference_only',
    );
    expect(registrationTiersForConference('usa-2026', false)).toContain(
      'conference_only',
    );
    expect(registrationTiersForConference('usa-2026', false)).not.toContain(
      'diaspora_nurses_allied_health',
    );
  });

  it('uses the Africa catalog only for Ghana and African countries', () => {
    expect(registrationTiersForAttendee('ghana-2027', false, 'GH')).toEqual([
      'african_nurses_midwives',
      'african_students',
      'african_physicians_allied',
      'reception_dinner',
    ]);
    expect(isRegistrationTierAllowedForConference('ghana-2027', 'african_students', false, 'KE')).toBe(
      true,
    );
    expect(
      isRegistrationTierAllowedForConference(
        'ghana-2027',
        'diaspora_nurses_allied_health',
        false,
        'GH',
      ),
    ).toBe(false);
    expect(isRegistrationTierAllowedForConference('ghana-2027', 'african_students', false, 'US')).toBe(
      false,
    );
    expect(defaultRegistrationTierForAttendee('ghana-2027', false, 'GH')).toBe(
      'african_nurses_midwives',
    );
    expect(registrationTiersForAttendee('usa-2026', false, 'GH')).not.toContain('african_students');
  });

  it('enforces each conference student catalog', () => {
    expect(isRegistrationTierAllowedForConference('ghana-2027', 'reception', true)).toBe(true);
    expect(isRegistrationTierAllowedForConference('ghana-2027', 'reception', false)).toBe(true);
    expect(isRegistrationTierAllowedForConference('ghana-2027', 'diaspora_student', true)).toBe(true);
    expect(isRegistrationTierAllowedForConference('ghana-2027', 'diaspora_student', false)).toBe(false);
    expect(
      isRegistrationTierAllowedForConference(
        'ghana-2027',
        'low_moderate_income_nurses_allied_health_student',
        false,
      ),
    ).toBe(false);
    expect(defaultRegistrationTierForConference('ghana-2027', true)).toBe('diaspora_student');
    expect(isRegistrationTierAllowedForConference('usa-2026', 'student_conference', true)).toBe(true);
    expect(isRegistrationTierAllowedForConference('usa-2026', 'student_conference', false)).toBe(false);
    expect(defaultRegistrationTierForConference('usa-2026', true)).toBe('student_conference');
  });

  it('rejects active conferences without an explicit ticket catalog', () => {
    expect(hasConferenceRegistrationConfig('new-event')).toBe(false);
    expect(() => getConferenceRegistrationConfig('new-event')).toThrow(
      /pricing is not configured/i,
    );
  });

  it('defaults the Africa catalog slug when conference slug is omitted', () => {
    expect(usesAfricaRegistrationCatalog(undefined, 'GH')).toBe(true);
    expect(usesAfricaRegistrationCatalog('  ghana-2027  ', 'GH')).toBe(true);
    expect(usesAfricaRegistrationCatalog('usa-2026', 'GH')).toBe(false);
  });

  it('formats Ghana catalog amounts in cedis', () => {
    expect(formatRegistrationAmount(1500, 'african_nurses_midwives')).toBe('GHS 1,500.00');
    expect(formatRegistrationAmount(200, 'conference_only', { withCode: true })).toBe('$200.00 USD');
    expect(formatRegistrationAmount(200, 'conference_only')).toBe('$200.00');
  });

  it('prices single-occupancy housing separately from shared', () => {
    expect(housingAmountUsd({ roomType: 'A', occupancy: 'single' })).toBeGreaterThan(
      housingAmountUsd({ roomType: 'A', occupancy: 'shared' }),
    );
    expect(
      totalAmountUsd({
        registrationTier: 'conference_only',
        needsHousing: true,
        roomType: 'A',
        occupancy: 'single',
      }).housingAmount,
    ).toBe(housingAmountUsd({ roomType: 'A', occupancy: 'single' }));
  });

  it('treats blank conference slugs as ghana-2027 for config lookup', () => {
    expect(hasConferenceRegistrationConfig(null)).toBe(true);
    expect(getConferenceRegistrationConfig(undefined).defaultTier).toBe('diaspora_nurses_allied_health');
  });

  it('defaults attendee tiers from country when Ghana uses the Africa catalog', () => {
    expect(defaultRegistrationTierForAttendee('ghana-2027', false, 'GH')).toBe('african_nurses_midwives');
    expect(defaultRegistrationTierForAttendee('ghana-2027', true, 'GH')).toBe('african_students');
    expect(defaultRegistrationTierForAttendee('usa-2026', false, 'US')).toBe('conference_only');
  });

  it('converts between USD major units and cents', () => {
    expect(centsFromUsd(250.005)).toBe(25_001);
    expect(usdFromCents(25_000)).toBe(250);
  });
});
