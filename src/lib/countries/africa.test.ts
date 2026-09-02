import { describe, expect, it } from 'vitest';

import {
  AFRICAN_COUNTRIES,
  AFRICAN_COUNTRY_CODES,
  isAfricanCountryCode,
} from '@/lib/countries/africa';

describe('African country catalog', () => {
  it('includes Ghana and excludes the United States', () => {
    expect(isAfricanCountryCode('GH')).toBe(true);
    expect(isAfricanCountryCode('gh')).toBe(true);
    expect(isAfricanCountryCode('US')).toBe(false);
    expect(isAfricanCountryCode('')).toBe(false);
  });

  it('lists 55 named African countries with unique ISO codes', () => {
    expect(AFRICAN_COUNTRIES).toHaveLength(55);
    expect(AFRICAN_COUNTRY_CODES.size).toBe(55);

    const codes = AFRICAN_COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect(AFRICAN_COUNTRIES.every((country) => country.name.trim().length > 0)).toBe(true);
  });

  it('includes Ghana, Nigeria, Kenya, and South Africa', () => {
    const byCode = Object.fromEntries(
      AFRICAN_COUNTRIES.map((country) => [country.code, country.name]),
    );
    expect(byCode.GH).toBe('Ghana');
    expect(byCode.NG).toBe('Nigeria');
    expect(byCode.KE).toBe('Kenya');
    expect(byCode.ZA).toBe('South Africa');
  });
});
