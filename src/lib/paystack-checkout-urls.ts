import type { RegistrationTier } from '@/lib/pricing';
import { AFRICA_REGISTRATION_TIERS } from '@/lib/pricing';

/** Hosted Paystack Shop pages for Ghana / Africa ticket categories. */
export const PAYSTACK_SHOP_URLS = {
  africanStudents: 'https://paystack.shop/pay/ewnjxj2xek',
  receptionDinner: 'https://paystack.shop/pay/64om8fbkou',
  africanPhysiciansAlliedHealth: 'https://paystack.shop/pay/e5tqqeg1xn',
  africanNursesMidwives: 'https://paystack.shop/pay/e-75uj2uyb',
} as const;

const AFRICA_TIERS = new Set<RegistrationTier>(AFRICA_REGISTRATION_TIERS);

/** Diaspora ticket keys saved before the Africa catalog was its own set of options. */
const LEGACY_GHANA_TIERS = new Set<RegistrationTier>([
  'diaspora_nurses_allied_health',
  'diaspora_physicians',
  'low_moderate_income_nurses_allied_health',
  'reception',
]);

const TIER_ENV_KEYS: Partial<Record<RegistrationTier, string>> = {
  african_nurses_midwives: 'PAYSTACK_CHECKOUT_URL_AFRICAN_NURSES_MIDWIVES',
  african_physicians_allied: 'PAYSTACK_CHECKOUT_URL_AFRICAN_PHYSICIANS_ALLIED',
  reception_dinner: 'PAYSTACK_CHECKOUT_URL_RECEPTION',
  diaspora_nurses_allied_health: 'PAYSTACK_CHECKOUT_URL_DIASPORA_NURSES_ALLIED_HEALTH',
  diaspora_physicians: 'PAYSTACK_CHECKOUT_URL_DIASPORA_PHYSICIANS',
  low_moderate_income_nurses_allied_health:
    'PAYSTACK_CHECKOUT_URL_LOW_MODERATE_INCOME_NURSES_ALLIED_HEALTH',
  reception: 'PAYSTACK_CHECKOUT_URL_RECEPTION',
};

const TIER_DEFAULTS: Partial<Record<RegistrationTier, string>> = {
  african_students: PAYSTACK_SHOP_URLS.africanStudents,
  reception_dinner: PAYSTACK_SHOP_URLS.receptionDinner,
  african_physicians_allied: PAYSTACK_SHOP_URLS.africanPhysiciansAlliedHealth,
  african_nurses_midwives: PAYSTACK_SHOP_URLS.africanNursesMidwives,
  diaspora_nurses_allied_health: PAYSTACK_SHOP_URLS.africanNursesMidwives,
  diaspora_physicians: PAYSTACK_SHOP_URLS.africanPhysiciansAlliedHealth,
  low_moderate_income_nurses_allied_health: PAYSTACK_SHOP_URLS.africanStudents,
  reception: PAYSTACK_SHOP_URLS.receptionDinner,
};

function envUrl(key: string | undefined): string | undefined {
  const raw = key ? process.env[key]?.trim() : undefined;
  return raw || undefined;
}

export function paystackStudentCheckoutUrl(): string {
  return (
    process.env.PAYSTACK_CHECKOUT_URL_AFRICAN_STUDENTS?.trim() ||
    PAYSTACK_SHOP_URLS.africanStudents
  );
}

export function paystackCheckoutUrlForTier(tier: RegistrationTier): string | undefined {
  if (tier === 'african_students') return paystackStudentCheckoutUrl();
  return envUrl(TIER_ENV_KEYS[tier]) ?? TIER_DEFAULTS[tier];
}

/**
 * Paystack Shop URL for an African registrant.
 * Each Africa catalog ticket goes to its own shop page.
 * Older diaspora ticket rows keep the previous student → African Students rule.
 * Returns null for non-Ghana tiers so initialize can fall back to the Paystack API.
 */
export function resolvePaystackCheckoutBaseUrl(row: {
  is_student?: boolean;
  registration_type: RegistrationTier;
}): string | null {
  if (AFRICA_TIERS.has(row.registration_type)) {
    return paystackCheckoutUrlForTier(row.registration_type) ?? null;
  }

  if (!LEGACY_GHANA_TIERS.has(row.registration_type)) {
    return null;
  }

  if (row.registration_type === 'reception') {
    return paystackCheckoutUrlForTier('reception') ?? null;
  }

  if (row.is_student) {
    return paystackStudentCheckoutUrl();
  }

  return paystackCheckoutUrlForTier(row.registration_type) ?? null;
}
