import { z } from 'zod';

import {
  type OccupancyType as HousingOccupancy,
  type RegistrationTier,
  type RoomTypeCode,
  totalAmountUsd,
} from '@/lib/pricing';

export const professionalRoles = [
  'registered_nurse',
  'nurse_practitioner',
  'certified_nurse_midwife',
  'physician',
  'pharmacist',
  'physician_associate',
  'researcher_scientist',
  'student_trainee',
  'policy_advocacy',
  'community_health_worker',
  'healthcare_administrator',
  'other',
] as const;

export const dietaryOptions = [
  'none',
  'vegetarian',
  'vegan',
  'halal',
  'kosher',
  'gluten_free',
  'nut_allergy',
  'other',
] as const;

export const accessibilityOptions = [
  'none',
  'wheelchair',
  'sign_language',
  'closed_captioning',
  'large_print',
  'other',
] as const;

export const heardAboutOptions = [
  'newsletter',
  'website',
  'facebook',
  'instagram',
  'linkedin',
  'x_twitter',
  'whatsapp',
  'word_of_mouth',
  'professional_association',
  'flyer',
  'news_media',
  'other',
] as const;

export const registrationTierSchema = z.enum([
  'conference_only',
  'student_conference',
  'reception_only',
  'conference_and_reception',
  'conference_and_reception_student',
]);

const registrationTierLiterals = registrationTierSchema.Enum;

/** Client + server validation */
export const registrationFormSchema = z
  .object({
    first_name: z.string().trim().min(1, 'First name is required'),
    middle_initial: z.string().trim().max(8).optional().or(z.literal('')),
    last_name: z.string().trim().min(1, 'Last name is required'),
    email: z.string().trim().email('Enter a valid email address'),
    phone: z.string().trim().min(7, 'Phone number is required'),
    professional_role: z.enum(professionalRoles),
    professional_role_other: z.string().trim().optional().or(z.literal('')),
    highest_degree: z.string().trim().min(1, 'Highest degree / credential is required'),
    institution: z.string().trim().min(1, 'Institution / organization is required'),
    department: z.string().trim().optional().or(z.literal('')),
    is_student: z.boolean(),
    country: z.string().trim().min(1, 'Country is required'),
    state_region: z.string().trim().min(1, 'State / province / region is required'),
    city: z.string().trim().min(1, 'City is required'),
    dietary_requirements: z.enum(dietaryOptions),
    dietary_other: z.string().trim().optional().or(z.literal('')),
    accessibility_needs: z.enum(accessibilityOptions),
    accessibility_other: z.string().trim().optional().or(z.literal('')),
    additional_notes: z.string().trim().optional().or(z.literal('')),
    needs_housing: z.enum(['yes', 'no']),
    room_type: z.enum(['A', 'B']).optional().nullable(),
    occupancy_type: z.enum(['single', 'shared']).optional().nullable(),
    heard_about_us: z.array(z.enum(heardAboutOptions)).min(1, 'Select at least one option'),
    heard_about_other: z.string().trim().optional().or(z.literal('')),
    instagram_handle: z.string().trim().optional().or(z.literal('')),
    x_handle: z.string().trim().optional().or(z.literal('')),
    linkedin_url: z.union([z.literal(''), z.string().trim().url('Enter a valid URL')]),
    facebook_handle: z.string().trim().optional().or(z.literal('')),
    other_social: z.string().trim().optional().or(z.literal('')),
    registration_type: registrationTierSchema,
  })
  .superRefine((data, ctx) => {
    if (data.professional_role === 'other' && !(data.professional_role_other ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please specify your role',
        path: ['professional_role_other'],
      });
    }
    if (data.needs_housing === 'yes') {
      if (!data.room_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select a room type',
          path: ['room_type'],
        });
      }
      if (!data.occupancy_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select single or shared occupancy',
          path: ['occupancy_type'],
        });
      }
    }
    if (data.dietary_requirements === 'other' && !(data.dietary_other ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Describe dietary needs',
        path: ['dietary_other'],
      });
    }
    if (data.accessibility_needs === 'other' && !(data.accessibility_other ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Describe accessibility needs',
        path: ['accessibility_other'],
      });
    }
    if (data.heard_about_us.includes('other') && !(data.heard_about_other ?? '').trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please specify',
        path: ['heard_about_other'],
      });
    }

    /** Student tiers must align with attendee student status when ticket is discounted for students */
    const tier = data.registration_type;
    const isStudentTicket =
      tier === registrationTierLiterals.student_conference ||
      tier === registrationTierLiterals.conference_and_reception_student;
    if (isStudentTicket && !data.is_student) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Student registration requires student status.',
        path: ['is_student'],
      });
    }

    /** Non-student must not choose student tiers */
    const studentTickets: RegistrationTier[] = [
      'student_conference',
      'conference_and_reception_student',
    ];
    if (!data.is_student && studentTickets.includes(tier)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a general registration tier or indicate you are a student.',
        path: ['registration_type'],
      });
    }
  });

export type RegistrationFormInput = z.input<typeof registrationFormSchema>;
export type RegistrationFormValues = z.infer<typeof registrationFormSchema>;

/**
 * Validates the full registration object and returns only the message for {@pathKey}, if any.
 * Use with TanStack Field `validators.onBlur` so one field surfaces one error at a time;
 * form-level `validators.onSubmit` still runs this schema on submit.
 */
export function registrationFieldMessage(key: keyof RegistrationFormValues, values: RegistrationFormValues): string | undefined {
  const result = registrationFormSchema.safeParse(values);
  if (result.success) return undefined;
  const issue = result.error.issues.find((i) => i.path[0] === key);
  return issue?.message;
}

export function summarizeForPersistence(values: RegistrationFormValues) {
  const needsHousing = values.needs_housing === 'yes';
  const tier = values.registration_type as RegistrationTier;
  const totals = totalAmountUsd({
    registrationTier: tier,
    needsHousing,
    roomType: needsHousing ? (values.room_type as RoomTypeCode) : null,
    occupancy: needsHousing ? (values.occupancy_type as 'single' | 'shared') : null,
  });

  const professional_role_label = formatProfessionalRole(values);
  const dietary_label = formatDietary(values);
  const accessibility_label = formatAccessibility(values);

  return {
    email: normalizeEmail(values.email),
    totals,
    payload: {
      first_name: values.first_name.trim(),
      middle_initial: normalizeOptional(values.middle_initial),
      last_name: values.last_name.trim(),
      phone: values.phone.trim(),
      professional_role: professional_role_label,
      highest_degree: values.highest_degree.trim(),
      institution: values.institution.trim(),
      department: normalizeOptional(values.department),
      is_student: values.is_student,
      country: values.country.trim(),
      state_region: values.state_region.trim(),
      city: values.city.trim(),
      dietary_requirements: dietary_label,
      accessibility_needs: accessibility_label,
      additional_notes: normalizeOptional(values.additional_notes),
      needs_housing: needsHousing,
      room_type: needsHousing ? values.room_type! : null,
      occupancy_type: needsHousing ? values.occupancy_type! : null,
      heard_about_us: heardAboutLabels(values),
      instagram_handle: normalizeOptional(values.instagram_handle),
      x_handle: normalizeOptional(values.x_handle),
      linkedin_url: normalizeOptional(values.linkedin_url),
      facebook_handle: normalizeOptional(values.facebook_handle),
      other_social: normalizeOptional(values.other_social),
      registration_type: tier,
      registration_amount: totals.registrationAmount,
      housing_amount: totals.housingAmount,
      total_amount: totals.totalAmount,
    },
  };
}

/** Compare stored totals to canonical pricing (rates object + nights) */
export function assertPricingMatches(rows: {
  registration_type: RegistrationTier;
  needs_housing: boolean;
  room_type: RoomTypeCode | null;
  occupancy_type: HousingOccupancy | null;
  registration_amount: string | number;
  housing_amount: string | number;
  total_amount: string | number;
}): boolean {
  const expected = totalAmountUsd({
    registrationTier: rows.registration_type,
    needsHousing: rows.needs_housing,
    roomType: rows.needs_housing ? rows.room_type : null,
    occupancy: rows.needs_housing ? rows.occupancy_type : null,
  });
  return (
    moneyEquals(rows.registration_amount, expected.registrationAmount) &&
    moneyEquals(rows.housing_amount, expected.housingAmount) &&
    moneyEquals(rows.total_amount, expected.totalAmount)
  );
}

function moneyEquals(raw: string | number, expected: number): boolean {
  const num = typeof raw === 'string' ? Number.parseFloat(raw) : raw;
  if (Number.isNaN(num)) return false;
  return Math.round(num * 100) === Math.round(expected * 100);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeOptional(v?: string | null) {
  const t = (v ?? '').trim();
  return t.length ? t : null;
}

function formatProfessionalRole(v: RegistrationFormValues) {
  if (v.professional_role === 'other') {
    return `Other: ${(v.professional_role_other ?? '').trim()}`;
  }
  const labels: Record<(typeof professionalRoles)[number], string> = {
    registered_nurse: 'Registered Nurse (RN)',
    nurse_practitioner: 'Nurse Practitioner (NP)',
    certified_nurse_midwife: 'Certified Nurse-Midwife',
    physician: 'Physician (MD/DO)',
    pharmacist: 'Pharmacist',
    physician_associate: 'Physician Associate (PA)',
    researcher_scientist: 'Researcher / Scientist',
    student_trainee: 'Student / Trainee',
    policy_advocacy: 'Policy / Advocacy',
    community_health_worker: 'Community Health Worker',
    healthcare_administrator: 'Healthcare Administrator',
    other: 'Other',
  };
  return labels[v.professional_role];
}

function formatDietary(v: RegistrationFormValues) {
  const base: Record<(typeof dietaryOptions)[number], string> = {
    none: 'None / No Restrictions',
    vegetarian: 'Vegetarian',
    vegan: 'Vegan',
    halal: 'Halal',
    kosher: 'Kosher',
    gluten_free: 'Gluten-Free',
    nut_allergy: 'Nut Allergy',
    other: 'Other',
  };
  const main = base[v.dietary_requirements];
  if (v.dietary_requirements === 'other') {
    return `${main}: ${(v.dietary_other ?? '').trim()}`;
  }
  return main;
}

function formatAccessibility(v: RegistrationFormValues) {
  const base: Record<(typeof accessibilityOptions)[number], string> = {
    none: 'None',
    wheelchair: 'Wheelchair Access',
    sign_language: 'Sign Language Interpreter',
    closed_captioning: 'Closed Captioning',
    large_print: 'Large Print Materials',
    other: 'Other',
  };
  const main = base[v.accessibility_needs];
  if (v.accessibility_needs === 'other') {
    return `${main}: ${(v.accessibility_other ?? '').trim()}`;
  }
  return main;
}

const heardAboutLabelsLookup: Record<(typeof heardAboutOptions)[number], string> = {
  newsletter: 'A-DNA / G-DNA Email Newsletter',
  website: 'A-DNA/G-DNA Website',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  x_twitter: 'X (Twitter)',
  whatsapp: 'WhatsApp / Group Chat',
  word_of_mouth: 'Word of Mouth / Colleague',
  professional_association: 'Professional Association',
  flyer: 'Flyer / Poster',
  news_media: 'News / Media Coverage',
  other: 'Other',
};

function heardAboutLabels(v: RegistrationFormValues) {
  const parts = v.heard_about_us.map((k) => {
    const base = heardAboutLabelsLookup[k];
    if (k === 'other') {
      return `${base}: ${(v.heard_about_other ?? '').trim()}`;
    }
    return base;
  });
  return parts;
}
