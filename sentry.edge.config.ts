import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "./src/lib/sentry-init";

Sentry.init(baseSentryOptions());
