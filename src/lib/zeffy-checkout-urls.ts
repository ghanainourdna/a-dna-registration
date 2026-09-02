import type { RegistrationTier } from '@/lib/pricing';

/** Default Zeffy ticketing page for USA 2026 student registrants (overridable via env). */
export const ZEFFY_STUDENT_TICKETING_DEFAULT =
  'https://www.zeffy.com/en-US/ticketing/a-dna-global-conference-usa-2026-students';

/**
 * Checkout base URL for the student Zeffy campaign.
 * Prefer `NEXT_PUBLIC_ZEFFY_STUDENT_CHECKOUT_URL`, then `ZEFFY_CHECKOUT_URL_STUDENT_CONFERENCE`, then the default hosted page.
 */
export function zeffyStudentCampaignCheckoutUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ZEFFY_STUDENT_CHECKOUT_URL?.trim() ||
    process.env.ZEFFY_CHECKOUT_URL_STUDENT_CONFERENCE?.trim() ||
    ZEFFY_STUDENT_TICKETING_DEFAULT
  );
}

export function zeffyShouldRouteToStudentCampaign(row: {
  is_student: boolean;
  registration_type: RegistrationTier;
}): boolean {
  if (row.registration_type === 'virtual') return false;
  if (
    row.registration_type !== 'student_conference' &&
    row.registration_type !== 'conference_and_reception_student' &&
    row.registration_type !== 'conference_only' &&
    row.registration_type !== 'reception_only' &&
    row.registration_type !== 'conference_and_reception'
  ) {
    return false;
  }
  if (row.is_student) return true;
  return (
    row.registration_type === 'student_conference' ||
    row.registration_type === 'conference_and_reception_student'
  );
}

/**
 * Optional per-tier hosted checkout URLs (from Zeffy: share link / deep link for one ticket).
 * When set, `/api/payment/initialize` redirects straight to that tier instead of the generic campaign page.
 *
 * Env names map 1:1 to {@link RegistrationTier} keys (uppercase snake).
 */
const TIER_ENV_KEYS: Record<RegistrationTier, string> = {
  conference_only: 'ZEFFY_CHECKOUT_URL_CONFERENCE_ONLY',
  student_conference: 'ZEFFY_CHECKOUT_URL_STUDENT_CONFERENCE',
  reception_only: 'ZEFFY_CHECKOUT_URL_RECEPTION_ONLY',
  conference_and_reception: 'ZEFFY_CHECKOUT_URL_CONFERENCE_AND_RECEPTION',
  conference_and_reception_student: 'ZEFFY_CHECKOUT_URL_CONFERENCE_AND_RECEPTION_STUDENT',
  virtual: 'ZEFFY_CHECKOUT_URL_VIRTUAL',
  diaspora_nurses_allied_health: 'ZEFFY_CHECKOUT_URL_DIASPORA_NURSES_ALLIED_HEALTH',
  diaspora_physicians: 'ZEFFY_CHECKOUT_URL_DIASPORA_PHYSICIANS',
  low_moderate_income_nurses_allied_health:
    'ZEFFY_CHECKOUT_URL_LOW_MODERATE_INCOME_NURSES_ALLIED_HEALTH',
  reception: 'ZEFFY_CHECKOUT_URL_RECEPTION',
};

export function zeffyCheckoutUrlForTier(tier: RegistrationTier): string | undefined {
  const key = TIER_ENV_KEYS[tier];
  const raw = key ? process.env[key]?.trim() : undefined;
  return raw || undefined;
}

/**
 * Hosted checkout URL for a saved registration.
 * USA student tickets use the student campaign. Virtual uses its own URL.
 * Ghana (and other) tiers use an optional per-tier URL, then the conference campaign fallback.
 */
export function resolveZeffyCheckoutBaseUrl(
  row: {
    is_student?: boolean;
    registration_type: RegistrationTier;
  },
  fallbackCampaignUrl: string,
): string {
  if (row.registration_type === 'virtual') {
    return zeffyCheckoutUrlForTier('virtual') ?? fallbackCampaignUrl;
  }

  if (
    row.is_student !== undefined &&
    zeffyShouldRouteToStudentCampaign({
      is_student: row.is_student,
      registration_type: row.registration_type,
    })
  ) {
    return zeffyStudentCampaignCheckoutUrl();
  }

  return zeffyCheckoutUrlForTier(row.registration_type) ?? fallbackCampaignUrl;
}
