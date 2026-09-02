import { describe, expect, it } from 'vitest';

import {
  registrationFieldMessage,
  registrationFieldValidators,
  registrationFormSchema,
  summarizeForPersistence,
  type RegistrationFormValues,
} from '@/lib/schemas/registration';

function validBase(
  overrides: Partial<RegistrationFormValues> = {},
): RegistrationFormValues {
  return {
    first_name: 'Ada',
    middle_initial: '',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone: '4105550100',
    professional_role: 'registered_nurse',
    professional_role_other: '',
    highest_degree: 'BSN',
    institution: 'Example Hospital',
    department: '',
    is_student: false,
    country: 'US',
    state_region: 'MD',
    city: 'Baltimore',
    dietary_requirements: 'none',
    dietary_other: '',
    accessibility_needs: 'none',
    accessibility_other: '',
    additional_notes: '',
    needs_housing: 'no',
    room_type: null,
    occupancy_type: null,
    heard_about_us: ['website'],
    heard_about_other: '',
    instagram_handle: '',
    x_handle: '',
    linkedin_url: '',
    facebook_handle: '',
    other_social: '',
    registration_type: 'diaspora_nurses_allied_health',
    ...overrides,
  };
}

describe('registrationFormSchema', () => {
  it('requires at least one heard_about_us option', () => {
    const result = registrationFormSchema.safeParse(
      validBase({ heard_about_us: [] }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === 'heard_about_us'),
      ).toBe(true);
    }
  });

  it('accepts heard_about_us with a selected option', () => {
    const result = registrationFormSchema.safeParse(
      validBase({ heard_about_us: ['instagram'] }),
    );
    expect(result.success).toBe(true);
  });

  it('does not require room type or occupancy when housing is yes', () => {
    const result = registrationFormSchema.safeParse(
      validBase({
        needs_housing: 'yes',
        room_type: null,
        occupancy_type: null,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('persists housing as disabled even if the form sent yes', () => {
    const persisted = summarizeForPersistence(
      validBase({
        needs_housing: 'yes',
        room_type: 'B',
        occupancy_type: 'shared',
      }),
    );
    expect(persisted.payload.needs_housing).toBe(false);
    expect(persisted.payload.room_type).toBeNull();
    expect(persisted.payload.occupancy_type).toBeNull();
    expect(persisted.payload.housing_amount).toBe(0);
  });

  it('allows reception only for students, and students may only choose reception', () => {
    expect(
      registrationFormSchema.safeParse(
        validBase({ is_student: false, registration_type: 'reception' }),
      ).success,
    ).toBe(false);
    expect(
      registrationFormSchema.safeParse(
        validBase({ is_student: true, registration_type: 'reception' }),
      ).success,
    ).toBe(true);
    expect(
      registrationFormSchema.safeParse(
        validBase({
          is_student: true,
          registration_type: 'diaspora_nurses_allied_health',
        }),
      ).success,
    ).toBe(false);
  });

  it('accepts physician and low/moderate-income tiers at the new prices', () => {
    const physicians = summarizeForPersistence(
      validBase({ registration_type: 'diaspora_physicians' }),
    );
    expect(physicians.payload.registration_amount).toBe(350);
    expect(physicians.payload.total_amount).toBe(350);

    const lowIncome = summarizeForPersistence(
      validBase({
        registration_type: 'low_moderate_income_nurses_allied_health',
      }),
    );
    expect(lowIncome.payload.registration_amount).toBe(150);
    expect(lowIncome.payload.total_amount).toBe(150);
  });

  it('keeps USA 2026 pricing valid for historical payment reconciliation', () => {
    const usaConference = summarizeForPersistence(
      validBase({
        conference_slug: 'usa-2026',
        registration_type: 'conference_only',
      }),
    );
    expect(usaConference.payload.registration_amount).toBe(200);
    expect(usaConference.payload.total_amount).toBe(200);

    const usaStudent = summarizeForPersistence(
      validBase({
        conference_slug: 'usa-2026',
        is_student: true,
        registration_type: 'student_conference',
      }),
    );
    expect(usaStudent.payload.registration_amount).toBe(100);
    expect(usaStudent.payload.total_amount).toBe(100);
  });

  it('requires and persists housing details only for housing-enabled conferences', () => {
    expect(
      registrationFormSchema.safeParse(
        validBase({ conference_slug: 'usa-2026', needs_housing: 'yes' }),
      ).success,
    ).toBe(false);

    const persisted = summarizeForPersistence(
      validBase({
        conference_slug: 'usa-2026',
        registration_type: 'conference_only',
        needs_housing: 'yes',
        room_type: 'A',
        occupancy_type: 'shared',
      }),
    );
    expect(persisted.payload.needs_housing).toBe(true);
    expect(persisted.payload.housing_amount).toBe(294.34);
  });

  it('uses the conference database housing setting when it overrides the catalog', () => {
    const values = validBase({
      conference_slug: 'ghana-2027',
      conference_housing_enabled: true,
      needs_housing: 'yes',
      room_type: 'A',
      occupancy_type: 'shared',
    });
    expect(registrationFormSchema.safeParse(values).success).toBe(true);

    const persisted = summarizeForPersistence(values, 'ghana-2027', true);
    expect(persisted.payload.needs_housing).toBe(true);
    expect(persisted.payload.housing_amount).toBe(294.34);
  });
});

describe('registrationFieldMessage / validators', () => {
  it('returns heard_about message only for that field', () => {
    const values = validBase({ heard_about_us: [], first_name: '' });
    expect(registrationFieldMessage('heard_about_us', values)).toMatch(
      /select at least one/i,
    );
    expect(registrationFieldMessage('first_name', values)).toMatch(/required/i);
    expect(registrationFieldMessage('heard_about_us', validBase())).toBeUndefined();
  });

  it('surfaces reception student-only error', () => {
    const values = validBase({
      is_student: false,
      registration_type: 'reception',
    });
    expect(registrationFieldMessage('registration_type', values)).toMatch(
      /students only/i,
    );
  });

  it('exposes onChange and onSubmit validators (not onBlur)', () => {
    const validators = registrationFieldValidators('heard_about_us');
    expect(validators).toHaveProperty('onChange');
    expect(validators).toHaveProperty('onSubmit');
    expect(validators).not.toHaveProperty('onBlur');
  });
});
