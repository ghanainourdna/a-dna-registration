import type { RegistrationTier } from '@/lib/pricing';

export const REGISTRATION_TIER_LABELS: Record<
  RegistrationTier,
  { label: string; price: number; note?: string }
> = {
  conference_only: { label: '$200 - Conference Only', price: 200 },
  student_conference: { label: '$100 - Student Conference', price: 100 },
  reception_only: { label: '$100 - Reception Only', price: 100 },
  conference_and_reception: {
    label: '$250 - Conference + Reception',
    price: 250,
  },
  conference_and_reception_student: {
    label: '$200 - Student Conference + Reception',
    price: 200,
  },
  virtual: { label: '$100 - Virtual', price: 100 },
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
