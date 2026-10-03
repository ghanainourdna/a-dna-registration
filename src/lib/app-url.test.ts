import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAppBaseUrl } from '@/lib/app-url';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveAppBaseUrl', () => {
  it('prefers NEXT_PUBLIC_APP_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://campaign.g-dna.org/');
    expect(resolveAppBaseUrl()).toBe('https://campaign.g-dna.org');
  });

  it('uses the request Origin when env is unset', () => {
    const headers = new Headers({ origin: 'http://localhost:3001' });
    expect(resolveAppBaseUrl({ headers })).toBe('http://localhost:3001');
  });

  it('falls back to localhost in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(resolveAppBaseUrl()).toBe('http://127.0.0.1:3000');
  });
});
