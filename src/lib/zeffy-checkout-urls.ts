import type { RegistrationTier } from '@/lib/pricing';

/**
 * Optional per-tier hosted checkout URLs (from Zeffy: share link / deep link for one ticket).
 * When set, `/api/payment/initialize` redirects straight to that tier instead of the generic campaign page.
 *
 * Env names map 1:1 to {@link RegistrationTier} keys (uppercase snake).
 */
const TIER_ENV_KEYS: Record<RegistrationTier, string> = {
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
 * Prefer a per-tier Zeffy deep link when configured; otherwise the campaign fallback.
 */
export function resolveZeffyCheckoutBaseUrl(
  row: {
    registration_type: RegistrationTier;
  },
  fallbackCampaignUrl: string,
): string {
  return zeffyCheckoutUrlForTier(row.registration_type) ?? fallbackCampaignUrl;
}
