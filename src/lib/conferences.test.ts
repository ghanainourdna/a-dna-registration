import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONFERENCE_SLUG,
  DEFAULT_GHANA_2027_CONFERENCE,
  DEFAULT_USA_2026_CONFERENCE,
  GHANA_2027_CONFERENCE_SLUG,
  isReservedRegisterSlug,
  normalizeConferenceSlug,
  normalizeWorldCountry,
} from '@/lib/conferences';

describe('conference slugs', () => {
  it('defaults an empty slug to ghana-2027', () => {
    expect(normalizeConferenceSlug('')).toBe(DEFAULT_CONFERENCE_SLUG);
    expect(normalizeConferenceSlug(undefined)).toBe(DEFAULT_CONFERENCE_SLUG);
    expect(normalizeConferenceSlug(' Ghana-2027 ')).toBe('ghana-2027');
    expect(normalizeConferenceSlug('usa-2026')).toBe('usa-2026');
  });

  it('does not treat success/failed as conference slugs', () => {
    expect(isReservedRegisterSlug('success')).toBe(true);
    expect(isReservedRegisterSlug('failed')).toBe(true);
    expect(isReservedRegisterSlug('usa-2026')).toBe(false);
    expect(isReservedRegisterSlug('ghana-2027')).toBe(false);
  });

  it('defines Ghana 2027 copy for /register/ghana-2027', () => {
    expect(GHANA_2027_CONFERENCE_SLUG).toBe('ghana-2027');
    expect(DEFAULT_GHANA_2027_CONFERENCE.title).toBe('A-DNA Ghana Conference 2027');
    expect(DEFAULT_GHANA_2027_CONFERENCE.tagline).toBe('The Future Of African HealthCare');
    expect(DEFAULT_GHANA_2027_CONFERENCE.theme).toBe(
      'Diaspora Partnership for sustainable Impact',
    );
    expect(DEFAULT_GHANA_2027_CONFERENCE.dates_label).toBe('7–9 January 2027');
    expect(DEFAULT_GHANA_2027_CONFERENCE.location_label).toMatch(/UPSA, Accra/);
    expect(DEFAULT_GHANA_2027_CONFERENCE.world_country).toBe('africa');
    expect(DEFAULT_USA_2026_CONFERENCE.world_country).toBe('all');
    expect(DEFAULT_USA_2026_CONFERENCE.is_active).toBe(true);
  });

  it('reads world_country as africa or all', () => {
    expect(normalizeWorldCountry('africa')).toBe('africa');
    expect(normalizeWorldCountry(' Africa ')).toBe('africa');
    expect(normalizeWorldCountry('all')).toBe('all');
    expect(normalizeWorldCountry('')).toBe('all');
    expect(normalizeWorldCountry(undefined)).toBe('all');
  });
});
