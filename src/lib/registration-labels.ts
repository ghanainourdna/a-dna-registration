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
    note: 'Available until Nov 1',
  },
  diaspora_physicians: {
    label: '$350 - Diaspora Physicians',
    price: 350,
    note: 'Available until Nov 1',
  },
  diaspora_student: {
    label: '$200 - Diaspora Student',
    price: 200,
    note: 'Available until Nov 1',
  },
  low_moderate_income_nurses_allied_health: {
    label: '$150 - Low- and Moderate-Income Nurses, Midwives and Allied Health',
    price: 150,
    note: 'Available until Nov 1',
  },
  low_moderate_income_nurses_allied_health_student: {
    label: '$75 - Low- and Moderate-Income Nurses, Midwives and Allied Health Student',
    price: 75,
    note: 'Available until Nov 1',
  },
  low_moderate_income_physician: {
    label: '$250 - Low- and Moderate-Income Physician',
    price: 250,
    note: 'Available until Nov 1',
  },
  reception: {
    label: '$100 - Reception',
    price: 100,
    note: 'Available until Nov 1',
  },
  african_students: {
    label: 'GHS 750 - African Students',
    price: 750,
    note: 'First degree student members · 3-day conference',
  },
  reception_dinner: {
    label: 'GHS 1,000 - Reception Dinner',
    price: 1000,
  },
  african_physicians_allied: {
    label: 'GHS 2,000 - African Physicians and Allied',
    price: 2000,
  },
  african_nurses_midwives: {
    label: 'GHS 1,500 - African Nurses and Midwives',
    price: 1500,
  },
};
