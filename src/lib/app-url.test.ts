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

  it('uses VERCEL_URL when configured', () => {
    vi.stubEnv('VERCEL_URL', 'my-app.vercel.app/');
    expect(resolveAppBaseUrl()).toBe('https://my-app.vercel.app');
  });

  it('derives the origin from forwarded host headers', () => {
    const headers = new Headers({
      'x-forwarded-host': 'edge.example.com, internal',
      'x-forwarded-proto': 'http,https',
    });
    expect(resolveAppBaseUrl({ headers })).toBe('http://edge.example.com');
  });

  it('returns undefined outside development when env and request hints are missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveAppBaseUrl()).toBeUndefined();
  });

  it('honors a custom PORT in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PORT', '4000');
    expect(resolveAppBaseUrl()).toBe('http://127.0.0.1:4000');
  });
});
