import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "./lib/sentry-init";

Sentry.init({
  ...baseSentryOptions(),
  integrations: [Sentry.browserTracingIntegration()],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
