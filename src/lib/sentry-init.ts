function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getDsn(): string | undefined {
  return readEnv("NEXT_PUBLIC_SENTRY_DSN") ?? readEnv("SENTRY_DSN");
}

export function isSentryEnabled(): boolean {
  return Boolean(getDsn());
}

export function sentryEnvironment(): string {
  return (
    process.env.SENTRY_ENVIRONMENT ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "development"
  );
}

/** Shared init options for browser, Node, and Edge. */
export function baseSentryOptions() {
  const production = process.env.NODE_ENV === "production";

  return {
    dsn: getDsn(),
    enabled: isSentryEnabled(),
    environment: sentryEnvironment(),
    sendDefaultPii: false,
    tracesSampleRate: production ? 0.1 : 1,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
    ],
  };
}
