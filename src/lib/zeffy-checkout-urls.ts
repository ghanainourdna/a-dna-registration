import type { RegistrationTier } from '@/lib/pricing';

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
};

export function zeffyCheckoutUrlForTier(tier: RegistrationTier): string | undefined {
  const key = TIER_ENV_KEYS[tier];
  const raw = key ? process.env[key]?.trim() : undefined;
  return raw || undefined;
}
