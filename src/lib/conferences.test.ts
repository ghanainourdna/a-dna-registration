import { afterEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}));

import {
  DEFAULT_CONFERENCE_SLUG,
  DEFAULT_GHANA_2027_CONFERENCE,
  DEFAULT_USA_2026_CONFERENCE,
  GHANA_2027_CONFERENCE_SLUG,
  InvalidConferenceError,
  envKeyForConferenceSlug,
  fetchConferenceBySlug,
  isReservedRegisterSlug,
  normalizeConferenceSlug,
  normalizeWorldCountry,
  requireConferenceBySlug,
  resolveConferenceCheckoutUrl,
  resolveConferenceZeffyCampaignId,
} from '@/lib/conferences';

afterEach(() => {
  vi.unstubAllEnvs();
  createClient.mockReset();
});

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

describe('Zeffy env resolution', () => {
  it('builds slug-specific env keys', () => {
    expect(envKeyForConferenceSlug('ZEFFY_CAMPAIGN_ID', 'ghana-2027')).toBe(
      'ZEFFY_CAMPAIGN_ID_GHANA_2027',
    );
  });

  it('prefers DB campaign ids and slug env overrides', () => {
    expect(resolveConferenceZeffyCampaignId('usa-2026', ' db-id ')).toBe('db-id');
    vi.stubEnv('ZEFFY_CAMPAIGN_ID_USA_2026', 'slug-id');
    expect(resolveConferenceZeffyCampaignId('usa-2026', null)).toBe('slug-id');
    vi.stubEnv('ZEFFY_CAMPAIGN_ID', 'default-id');
    expect(resolveConferenceZeffyCampaignId('ghana-2027', null)).toBe('default-id');
    expect(resolveConferenceZeffyCampaignId('usa-2026', null)).toBe('slug-id');
    expect(resolveConferenceZeffyCampaignId('other-event', null)).toBeNull();
    vi.stubEnv('ZEFFY_CAMPAIGN_ID', '   ');
    expect(resolveConferenceZeffyCampaignId('ghana-2027', null)).toBeNull();
  });

  it('resolves checkout URLs from DB, slug env, or default', () => {
    expect(
      resolveConferenceCheckoutUrl({
        slug: 'usa-2026',
        dbUrl: ' https://db.example ',
        defaultEnvUrl: 'https://default.example',
      }),
    ).toBe('https://db.example');
    vi.stubEnv('NEXT_PUBLIC_ZEFFY_CHECKOUT_URL_USA_2026', 'https://slug.example');
    expect(
      resolveConferenceCheckoutUrl({
        slug: 'usa-2026',
        defaultEnvUrl: 'https://default.example',
      }),
    ).toBe('https://slug.example');
    expect(
      resolveConferenceCheckoutUrl({
        slug: 'ghana-2027',
        defaultEnvUrl: 'https://default.example',
      }),
    ).toBe('https://default.example');
    expect(() =>
      resolveConferenceCheckoutUrl({
        slug: 'other-event',
        defaultEnvUrl: '',
      }),
    ).toThrow(/not configured/);
    expect(() =>
      resolveConferenceCheckoutUrl({
        slug: 'ghana-2027',
        defaultEnvUrl: '   ',
      }),
    ).toThrow(/not configured/);
  });
});

describe('fetchConferenceBySlug', () => {
  it('returns null for reserved slugs and unknown catalogs', async () => {
    await expect(fetchConferenceBySlug('success')).resolves.toBeNull();
    await expect(fetchConferenceBySlug('unknown-event')).resolves.toBeNull();
  });

  it('uses hardcoded fallbacks during E2E fixture runs', async () => {
    vi.stubEnv('E2E_FIXTURE_COUNTRIES', '1');
    await expect(fetchConferenceBySlug('ghana-2027')).resolves.toMatchObject({
      slug: 'ghana-2027',
      is_active: true,
    });
    await expect(fetchConferenceBySlug('usa-2026')).resolves.toMatchObject({
      slug: 'usa-2026',
    });
  });

  it('falls back when Supabase is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('E2E_FIXTURE_COUNTRIES', '');
    await expect(fetchConferenceBySlug('ghana-2027')).resolves.toMatchObject({
      slug: GHANA_2027_CONFERENCE_SLUG,
      title: DEFAULT_GHANA_2027_CONFERENCE.title,
    });
  });

  it('falls back when the URL is present without API keys', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    await expect(fetchConferenceBySlug('ghana-2027')).resolves.toMatchObject({
      slug: GHANA_2027_CONFERENCE_SLUG,
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('maps Supabase rows and handles query failures', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-only');

    const maybeSingle = vi.fn();
    createClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle }),
          }),
        }),
      }),
    });

    maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'conf-1',
        slug: 'usa-2026',
        title: 'USA 2026',
        tagline: ' tag ',
        theme: null,
        dates_label: 'Aug 2026',
        location_label: 'Baltimore',
        reception_label: ' Reception ',
        zeffy_checkout_url: ' https://zeffy.test ',
        zeffy_campaign_id: ' camp ',
        world_country: 'africa',
        housing_enabled: false,
        is_active: true,
      },
      error: null,
    });
    maybeSingle.mockResolvedValueOnce({
      data: {
        slug: 'usa-2026',
        title: 'USA 2026',
        dates_label: 'Aug 2026',
        location_label: 'Baltimore',
        is_active: true,
      },
      error: null,
    });
    maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'conf-2',
        slug: 'usa-2026',
        title: 'USA 2026',
        dates_label: 'Aug 2026',
        location_label: 'Baltimore',
        is_active: true,
      },
      error: null,
    });
    await expect(fetchConferenceBySlug('usa-2026')).resolves.toMatchObject({
      id: 'conf-1',
      tagline: 'tag',
      reception_label: 'Reception',
      world_country: 'africa',
      housing_enabled: false,
      zeffy_checkout_url: 'https://zeffy.test',
    });
    await expect(fetchConferenceBySlug('usa-2026')).resolves.toMatchObject({
      id: null,
      slug: 'usa-2026',
    });
    await expect(fetchConferenceBySlug('usa-2026')).resolves.toMatchObject({
      id: 'conf-2',
      housing_enabled: true,
    });

    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });
    await expect(fetchConferenceBySlug('usa-2026')).resolves.toBeNull();

    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(fetchConferenceBySlug('usa-2026')).resolves.toBeNull();

    createClient.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(fetchConferenceBySlug('usa-2026')).resolves.toBeNull();
    errorLog.mockRestore();
  });
});

describe('requireConferenceBySlug', () => {
  it('loads an active conference row or rejects invalid slugs', async () => {
    await expect(requireConferenceBySlug({} as never, 'unknown-event')).rejects.toBeInstanceOf(
      InvalidConferenceError,
    );

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'conf-1',
                  slug: DEFAULT_CONFERENCE_SLUG,
                  title: 'Ghana',
                  dates_label: 'Jan 2027',
                  location_label: 'Accra',
                  is_active: true,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    await expect(requireConferenceBySlug(supabase as never, 'ghana-2027')).resolves.toEqual({
      id: 'conf-1',
      conference: expect.objectContaining({ slug: DEFAULT_CONFERENCE_SLUG }),
    });

    const missing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { slug: 'ghana-2027' }, error: null }),
            }),
          }),
        }),
      }),
    };
    await expect(requireConferenceBySlug(missing as never, 'ghana-2027')).rejects.toBeInstanceOf(
      InvalidConferenceError,
    );

    const failing = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: 'timeout' } }),
            }),
          }),
        }),
      }),
    };
    await expect(requireConferenceBySlug(failing as never, 'ghana-2027')).rejects.toThrow(/timeout/);
  });
});
