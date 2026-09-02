import { describe, expect, it } from 'vitest';

import {
  defaultRegistrationTierForConference,
  getConferenceRegistrationConfig,
  hasConferenceRegistrationConfig,
  isRegistrationTierAllowedForConference,
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

  it('enforces each conference student catalog', () => {
    expect(registrationTiersForConference('ghana-2027', true)).toEqual(['reception']);
    expect(registrationTiersForConference('ghana-2027', false)).not.toContain('reception');
    expect(isRegistrationTierAllowedForConference('ghana-2027', 'reception', true)).toBe(true);
    expect(isRegistrationTierAllowedForConference('ghana-2027', 'reception', false)).toBe(false);
    expect(
      isRegistrationTierAllowedForConference(
        'ghana-2027',
        'diaspora_nurses_allied_health',
        true,
      ),
    ).toBe(false);
    expect(defaultRegistrationTierForConference('ghana-2027', true)).toBe('reception');
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
