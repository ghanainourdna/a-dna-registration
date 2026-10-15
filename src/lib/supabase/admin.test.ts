import { afterEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn(() => ({ kind: 'supabase-admin' }));

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}));

describe('getSupabaseAdmin', () => {
  afterEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createClient.mockClear();
  });

  it('throws when Supabase env is missing', async () => {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    await expect(getSupabaseAdmin).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('creates and caches the service-role client', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');

    const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
    const first = getSupabaseAdmin();
    const second = getSupabaseAdmin();

    expect(first).toBe(second);
    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-key',
      expect.objectContaining({ auth: { persistSession: false, autoRefreshToken: false } }),
    );
  });
});
