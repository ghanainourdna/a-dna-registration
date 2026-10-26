import { afterEach, describe, expect, it, vi } from "vitest";

import {
  baseSentryOptions,
  isSentryEnabled,
  sentryEnvironment,
} from "./sentry-init";

describe("sentry-init", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled without a DSN", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.stubEnv("SENTRY_DSN", "");
    expect(isSentryEnabled()).toBe(false);
    expect(baseSentryOptions().enabled).toBe(false);
  });

  it("is enabled when NEXT_PUBLIC_SENTRY_DSN is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://example@o0.ingest.sentry.io/0");
    expect(isSentryEnabled()).toBe(true);
    const opts = baseSentryOptions();
    expect(opts.dsn).toContain("ingest.sentry.io");
    expect(opts.sendDefaultPii).toBe(false);
  });

  it("prefers SENTRY_ENVIRONMENT then VERCEL_ENV", () => {
    vi.stubEnv("SENTRY_ENVIRONMENT", "staging");
    expect(sentryEnvironment()).toBe("staging");
    vi.unstubAllEnvs();
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(sentryEnvironment()).toBe("preview");
  });

  it("falls back to SENTRY_DSN and production trace sampling", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.stubEnv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/1");
    vi.stubEnv("NODE_ENV", "production");
    expect(isSentryEnabled()).toBe(true);
    expect(baseSentryOptions().tracesSampleRate).toBe(0.1);
  });

  it("defaults environment to development when unset", () => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    expect(sentryEnvironment()).toBe("test");
  });

  it("treats blank DSN env as unset", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "   ");
    vi.stubEnv("SENTRY_DSN", "https://example@o0.ingest.sentry.io/2");
    expect(isSentryEnabled()).toBe(true);
  });

  it("uses development when no environment vars are set", () => {
    vi.unstubAllEnvs();
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;
    expect(sentryEnvironment()).toBe("development");
  });
});
