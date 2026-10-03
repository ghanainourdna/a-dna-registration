import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkoutRegionForCountry,
  countryListScopeForVisitor,
  detectVisitorCountry,
  detectVisitorCountryFromHeaders,
  guessCountryFromTimeZone,
  guessRegionFromTimeZone,
  isPublicIpAddress,
  lookupCountryFromPublicIp,
  normalizeCountryCode,
  publicClientIpFromHeaders,
  resetPublicIpCountryCache,
} from '@/lib/visitor-location';

afterEach(() => {
  vi.unstubAllEnvs();
  resetPublicIpCountryCache();
});

describe('normalizeCountryCode', () => {
  it('accepts ISO codes and drops CDN placeholders', () => {
    expect(normalizeCountryCode('gh')).toBe('GH');
    expect(normalizeCountryCode('US')).toBe('US');
    expect(normalizeCountryCode('XX')).toBeNull();
    expect(normalizeCountryCode('')).toBeNull();
  });
});

describe('checkoutRegionForCountry', () => {
  it('splits Ghana/Africa from everywhere else', () => {
    expect(checkoutRegionForCountry('GH')).toBe('africa');
    expect(checkoutRegionForCountry('NG')).toBe('africa');
    expect(checkoutRegionForCountry('US')).toBe('other');
    expect(checkoutRegionForCountry('GB')).toBe('other');
    expect(checkoutRegionForCountry(null)).toBeNull();
  });
});

describe('detectVisitorCountryFromHeaders', () => {
  it('reads Vercel and Cloudflare country headers', () => {
    expect(
      detectVisitorCountryFromHeaders(new Headers({ 'x-vercel-ip-country': 'GH' })),
    ).toBe('GH');
    expect(detectVisitorCountryFromHeaders(new Headers({ 'cf-ipcountry': 'us' }))).toBe('US');
  });

  it('prefers NEXT_PUBLIC_DEV_VISITOR_COUNTRY in local testing', () => {
    vi.stubEnv('NEXT_PUBLIC_DEV_VISITOR_COUNTRY', 'NG');
    expect(
      detectVisitorCountryFromHeaders(new Headers({ 'x-vercel-ip-country': 'US' })),
    ).toBe('NG');
  });
});

describe('timezone fallback', () => {
  it('maps Accra to Ghana and New York to the US', () => {
    expect(guessCountryFromTimeZone('Africa/Accra')).toBe('GH');
    expect(guessCountryFromTimeZone('America/New_York')).toBe('US');
    expect(guessRegionFromTimeZone('Africa/Accra')).toBe('africa');
    expect(guessRegionFromTimeZone('Africa/Ouagadougou')).toBe('africa');
    expect(guessRegionFromTimeZone('Europe/London')).toBe('other');
  });
});

describe('public IP country lookup', () => {
  it('ignores localhost and private addresses', () => {
    expect(isPublicIpAddress('127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('10.0.0.8')).toBe(false);
    expect(isPublicIpAddress('192.168.1.10')).toBe(false);
    expect(isPublicIpAddress('172.16.0.2')).toBe(false);
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(publicClientIpFromHeaders(new Headers({ 'x-forwarded-for': '127.0.0.1' }))).toBeNull();
    expect(
      publicClientIpFromHeaders(new Headers({ 'x-forwarded-for': '102.176.84.1, 127.0.0.1' })),
    ).toBe('102.176.84.1');
  });

  it('reads country.is and caches the result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ip: '102.176.84.1', country: 'gh' }),
    });
    await expect(lookupCountryFromPublicIp('102.176.84.1', fetchImpl)).resolves.toBe('GH');
    await expect(lookupCountryFromPublicIp('102.176.84.1', fetchImpl)).resolves.toBe('GH');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back to a public-IP lookup when geo headers are missing', async () => {
    const fetchImpl = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ ip: '197.251.1.1', country: 'NG' }),
      } as Response);

    await expect(detectVisitorCountry(new Headers())).resolves.toBe('NG');
    fetchImpl.mockRestore();
  });

  it('skips IP lookup during Playwright fixture runs', async () => {
    vi.stubEnv('E2E_FIXTURE_COUNTRIES', '1');
    const fetchImpl = vi.spyOn(globalThis, 'fetch');
    await expect(detectVisitorCountry(new Headers())).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    fetchImpl.mockRestore();
  });
});

describe('countryListScopeForVisitor', () => {
  it('opens the African list for Ghana and the full list otherwise', () => {
    expect(
      countryListScopeForVisitor({
        detectedCountry: 'GH',
        conferenceWorldCountry: 'all',
      }),
    ).toBe('africa');
    expect(
      countryListScopeForVisitor({
        detectedCountry: 'US',
        conferenceWorldCountry: 'africa',
      }),
    ).toBe('all');
    expect(
      countryListScopeForVisitor({
        detectedCountry: null,
        conferenceWorldCountry: 'africa',
      }),
    ).toBe('africa');
  });
});
