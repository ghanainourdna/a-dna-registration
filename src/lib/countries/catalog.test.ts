import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}));

describe('fetchCountriesCatalog', () => {
  beforeEach(() => {
    createClient.mockReset();
  });

  afterEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns the E2E fixture list when enabled', async () => {
    vi.stubEnv('E2E_FIXTURE_COUNTRIES', '1');
    const { fetchCountriesCatalog } = await import('@/lib/countries/catalog');
    const rows = await fetchCountriesCatalog();
    expect(rows.some((row) => row.code === 'US')).toBe(true);
    expect(rows.some((row) => row.code === 'GH')).toBe(true);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('falls back when the URL is set without any API keys', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetchCountriesCatalog } = await import('@/lib/countries/catalog');
    await expect(fetchCountriesCatalog()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'GH' })]));
    warn.mockRestore();
  });

  it('falls back to the African list when Supabase env is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetchCountriesCatalog } = await import('@/lib/countries/catalog');
    const first = await fetchCountriesCatalog();
    const second = await fetchCountriesCatalog();
    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('maps Supabase rows and falls back on query errors', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

    const from = vi.fn();
    createClient.mockReturnValue({ from });

    const { fetchCountriesCatalog } = await import('@/lib/countries/catalog');

    from.mockReturnValueOnce({
      select: () => ({
        order: async () => ({
          data: [
            { code: ' gh ', name: 'Ghana' },
            { code: '', name: 'Bad' },
            { code: null, name: 'Null code' },
            { code: 'US', name: null },
          ],
          error: null,
        }),
      }),
    });
    await expect(fetchCountriesCatalog()).resolves.toEqual([{ code: 'GH', name: 'Ghana' }]);

    from.mockReturnValueOnce({
      select: () => ({
        order: async () => ({
          data: [{ code: 'US', name: '' }, { code: 'GH', name: 'Ghana' }],
          error: null,
        }),
      }),
    });
    await expect(fetchCountriesCatalog()).resolves.toEqual([{ code: 'GH', name: 'Ghana' }]);

    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    from.mockReturnValueOnce({
      select: () => ({
        order: async () => ({ data: null, error: { message: 'boom' } }),
      }),
    });
    const fallback = await fetchCountriesCatalog();
    expect(fallback.length).toBeGreaterThan(0);

    from.mockReturnValueOnce({
      select: () => ({
        order: async () => ({ data: null, error: null }),
      }),
    });
    await expect(fetchCountriesCatalog()).resolves.toEqual(fallback);

    from.mockReturnValueOnce({
      select: () => ({
        order: async () => ({ data: [], error: null }),
      }),
    });
    await expect(fetchCountriesCatalog()).resolves.toEqual(fallback);

    from.mockImplementationOnce(() => {
      throw new Error('network');
    });
    await expect(fetchCountriesCatalog()).resolves.toEqual(fallback);
    errorLog.mockRestore();
  });

  it('prefers the anon key when both anon and service role are configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    createClient.mockReturnValue({
      from: () => ({
        select: () => ({
          order: async () => ({ data: [{ code: 'GH', name: 'Ghana' }], error: null }),
        }),
      }),
    });
    const { fetchCountriesCatalog } = await import('@/lib/countries/catalog');
    await fetchCountriesCatalog();
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key', expect.any(Object));
  });

  it('uses the service role when the anon key is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    createClient.mockReturnValue({
      from: () => ({
        select: () => ({
          order: async () => ({ data: [{ code: 'US', name: 'United States' }], error: null }),
        }),
      }),
    });

    const { fetchCountriesCatalog } = await import('@/lib/countries/catalog');
    await expect(fetchCountriesCatalog()).resolves.toEqual([{ code: 'US', name: 'United States' }]);
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'service-key', expect.any(Object));
  });
});
