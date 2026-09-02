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
  'diaspora_nurses_allied_health',
  'diaspora_physicians',
  'low_moderate_income_nurses_allied_health',
  'reception',
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
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, 'Country is required')
      .transform((s) => s.toUpperCase()),
    state_region: z.string().trim().min(1, 'State / province / region is required'),
    city: z.string().trim().min(1, 'City is required'),
    dietary_requirements: z.enum(dietaryOptions),
    dietary_other: z.string().trim().optional().or(z.literal('')),
    accessibility_needs: z.enum(accessibilityOptions),
    accessibility_other: z.string().trim().optional().or(z.literal('')),
    additional_notes: z.string().trim().optional().or(z.literal('')),
    needs_housing: z.enum(['yes', 'no']),
    room_type: z.enum(['A', 'B', 'C']).optional().nullable(),
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
    if (data.registration_type === registrationTierLiterals.reception && !data.is_student) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reception registration is available to students only.',
        path: ['registration_type'],
      });
    }
  });

export type RegistrationFormInput = z.input<typeof registrationFormSchema>;
export type RegistrationFormValues = z.infer<typeof registrationFormSchema>;

/**
 * Cross-field rules that live in `superRefine`. Zod only runs `superRefine` when the
 * object shape already parses, so empty required strings would hide student
 * errors during partial form fills. Field validators call this first.
 */
export function registrationCrossFieldMessage(
  key: keyof RegistrationFormValues,
  data: RegistrationFormValues,
): string | undefined {
  if (
    (key === 'registration_type' || key === 'is_student') &&
    data.registration_type === registrationTierLiterals.reception &&
    !data.is_student
  ) {
    return 'Reception registration is available to students only.';
  }

  return undefined;
}

/**
 * Validates the full registration object and returns only the message for {@pathKey}, if any.
 * Use with TanStack Field `validators.onChange` so one field surfaces one error at a time;
 * form-level `validators.onSubmit` still runs this schema on submit.
 */
export function registrationFieldMessage(key: keyof RegistrationFormValues, values: RegistrationFormValues): string | undefined {
  const cross = registrationCrossFieldMessage(key, values);
  if (cross) return cross;

  const result = registrationFormSchema.safeParse(values);
  if (result.success) return undefined;
  const issue = result.error.issues.find((i) => i.path[0] === key);
  return issue?.message;
}

/**
 * Field validators must use `onChange` (not `onBlur` alone).
 * TanStack Form stores submit-time field errors under the matching cause; an
 * `onBlur` error is not cleared by `handleChange`, which blocked Register & Pay
 * after checkbox/radio selection. Mirror the check on `onSubmit` so resubmit
 * always re-evaluates current values.
 */
export function registrationFieldValidators(
  key: keyof RegistrationFormValues,
  deps?: readonly (keyof RegistrationFormValues)[],
) {
  const validate = ({
    fieldApi,
  }: {
    fieldApi: { form: { state: { values: RegistrationFormValues } } };
  }) => registrationFieldMessage(key, fieldApi.form.state.values);

  return deps?.length
    ? { onChange: validate, onSubmit: validate, onChangeListenTo: [...deps] }
    : { onChange: validate, onSubmit: validate };
}

export function summarizeForPersistence(values: RegistrationFormValues) {
  const tier = values.registration_type as RegistrationTier;
  const totals = totalAmountUsd({
    registrationTier: tier,
    needsHousing: false,
    roomType: null,
    occupancy: null,
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
      country: values.country,
      state_region: values.state_region.trim(),
      city: values.city.trim(),
      dietary_requirements: dietary_label,
      accessibility_needs: accessibility_label,
      additional_notes: normalizeOptional(values.additional_notes),
      needs_housing: false,
      room_type: null,
      occupancy_type: null,
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
    const detail = (v.professional_role_other ?? '').trim();
    return detail ? `Other: ${detail}` : 'Other';
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
    const detail = (v.dietary_other ?? '').trim();
    return detail ? `${main}: ${detail}` : main;
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
    const detail = (v.accessibility_other ?? '').trim();
    return detail ? `${main}: ${detail}` : main;
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
      const detail = (v.heard_about_other ?? '').trim();
      return detail ? `${base}: ${detail}` : base;
    }
    return base;
  });
  return parts;
}
