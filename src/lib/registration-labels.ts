import type { RegistrationTier } from '@/lib/pricing';

export type RegistrationTierLabel = {
  label: string;
  price: number;
  /** Higher weight appears first in the registration type list. */
  weight: number;
  note?: string;
};

export const REGISTRATION_TIER_LABELS: Record<RegistrationTier, RegistrationTierLabel> = {
  conference_only: { label: '$200 - Conference Only', price: 200, weight: 50 },
  student_conference: { label: '$100 - Student Conference', price: 100, weight: 50 },
  reception_only: { label: '$100 - Reception Only', price: 100, weight: 48 },
  conference_and_reception: {
    label: '$250 - Conference + Reception',
    price: 250,
    weight: 52,
  },
  conference_and_reception_student: {
    label: '$200 - Student Conference + Reception',
    price: 200,
    weight: 52,
  },
  virtual: { label: '$100 - Virtual', price: 100, weight: 46 },
  diaspora_nurses_allied_health: {
    label: '$250 - Diaspora Nurses, Midwives and Allied Health',
    price: 250,
    weight: 12,
    note: 'Available until Nov 1',
  },
  diaspora_physicians: {
    label: '$350 - Diaspora Physicians',
    price: 350,
    weight: 10,
    note: 'Available until Nov 1',
  },
  diaspora_student: {
    label: '$175 - Diaspora Student',
    price: 175,
    weight: 8,
    note: 'Available until Nov 1',
  },
  low_moderate_income_nurses_allied_health: {
    label: '$150 - Low- and Middle-Income Nurses, Midwives and Allied Health',
    price: 150,
    weight: 6,
    note: 'Available until Nov 1',
  },
  low_moderate_income_nurses_allied_health_student: {
    label: '$75 - LMI Nurses, Midwives and Allied Health Student',
    price: 75,
    weight: 4,
    note: 'Available until Nov 1',
  },
  low_moderate_income_physician: {
    label: '$250 - LMI Physician',
    price: 250,
    weight: 2,
    note: 'Available until Nov 1',
  },
  reception: {
    label: '$100 - Reception',
    price: 100,
    weight: 0,
    note: 'Available until Nov 1',
  },
  african_students: {
    label: 'GHS 750 - African Students',
    price: 750,
    weight: 18,
    note: 'First degree student members · 3-day conference',
  },
  reception_dinner: {
    label: 'GHS 1,000 - Reception Dinner',
    price: 1000,
    weight: 14,
  },
  african_physicians_allied: {
    label: 'GHS 2,000 - African Physicians and Allied',
    price: 2000,
    weight: 16,
  },
  african_nurses_midwives: {
    label: 'GHS 1,500 - African Nurses and Midwives',
    price: 1500,
    weight: 20,
  },
};

export function sortRegistrationTiersByWeight(tiers: RegistrationTier[]): RegistrationTier[] {
  return [...tiers].sort((a, b) => {
    const weightDiff = REGISTRATION_TIER_LABELS[b].weight - REGISTRATION_TIER_LABELS[a].weight;
    if (weightDiff !== 0) return weightDiff;
    return a.localeCompare(b);
  });
}
