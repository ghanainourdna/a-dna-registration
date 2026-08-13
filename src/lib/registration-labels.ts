import type { RegistrationTier } from '@/lib/pricing';

export const REGISTRATION_TIER_LABELS: Record<RegistrationTier, { label: string; price: number }> = {
  conference_only: { label: '$200 — Conference Only', price: 200 },
  student_conference: { label: '$100 — Student Conference', price: 100 },
  reception_only: { label: '$100 — Reception Only', price: 100 },
  conference_and_reception: { label: '$250 — Conference + Reception', price: 250 },
  conference_and_reception_student: {
    label: '$200 — Student Conference + Reception',
    price: 200,
  },
  virtual: { label: '$100 — Virtual', price: 100 },
};
