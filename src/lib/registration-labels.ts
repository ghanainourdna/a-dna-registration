import type { RegistrationTier } from '@/lib/pricing';

export const REGISTRATION_TIER_LABELS: Record<
  RegistrationTier,
  { label: string; price: number; note?: string }
> = {
  diaspora_nurses_allied_health: {
    label: '$250 - Diaspora Nurses, Midwives and Allied Health',
    price: 250,
    note: 'Available until Oct 31',
  },
  diaspora_physicians: {
    label: '$350 - Diaspora Physicians',
    price: 350,
    note: 'Available until Oct 31',
  },
  low_moderate_income_nurses_allied_health: {
    label: '$150 - Low- and Moderate-Income Nurses, Midwives and Allied Health',
    price: 150,
    note: 'Available until Oct 31',
  },
  reception: {
    label: '$150 - Reception',
    price: 150,
    note: 'Available until Oct 31 · Shown for students in addition to the tickets above',
  },
};
