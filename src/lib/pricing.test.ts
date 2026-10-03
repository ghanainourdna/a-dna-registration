import { describe, expect, it } from 'vitest';

import {
  defaultRegistrationTierForAttendee,
  defaultRegistrationTierForConference,
  getConferenceRegistrationConfig,
  hasConferenceRegistrationConfig,
  isRegistrationTierAllowedForConference,
  registrationTiersForAttendee,
  registrationTiersForConference,
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
      'african_students',
      'reception_dinner',
      'african_physicians_allied',
      'african_nurses_midwives',
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
});
