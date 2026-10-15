import { describe, expect, it } from 'vitest';

import {
  accessibilityOptions,
  assertPricingMatches,
  dietaryOptions,
  heardAboutOptions,
  professionalRoles,
  registrationCrossFieldMessage,
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

  it('accepts the Africa catalog for Ghana and rejects diaspora tickets there', () => {
    const africa = registrationFormSchema.safeParse(
      validBase({
        country: 'GH',
        registration_type: 'african_nurses_midwives',
      }),
    );
    expect(africa.success).toBe(true);
    if (africa.success) {
      expect(summarizeForPersistence(africa.data).payload.registration_amount).toBe(1500);
    }

    expect(
      registrationFormSchema.safeParse(
        validBase({
          country: 'GH',
          registration_type: 'diaspora_nurses_allied_health',
        }),
      ).success,
    ).toBe(false);
    expect(
      registrationFormSchema.safeParse(
        validBase({
          country: 'US',
          registration_type: 'reception_dinner',
        }),
      ).success,
    ).toBe(false);
  });

  it('allows student tickets only for students and reception for everyone', () => {
    for (const registration_type of [
      'diaspora_student',
      'low_moderate_income_nurses_allied_health_student',
    ] as const) {
      expect(
        registrationFormSchema.safeParse(validBase({ is_student: false, registration_type }))
          .success,
      ).toBe(false);
      expect(
        registrationFormSchema.safeParse(validBase({ is_student: true, registration_type }))
          .success,
      ).toBe(true);
    }
    expect(
      registrationFormSchema.safeParse(
        validBase({ is_student: false, registration_type: 'reception' }),
      ).success,
    ).toBe(true);
  });

  it('prices the Zeffy diaspora tickets', () => {
    const cases = [
      ['diaspora_student', true, 175],
      ['low_moderate_income_nurses_allied_health_student', true, 75],
      ['low_moderate_income_physician', false, 250],
      ['reception', false, 100],
    ] as const;
    for (const [registration_type, is_student, amount] of cases) {
      const { payload } = summarizeForPersistence(validBase({ registration_type, is_student }));
      expect(payload.registration_amount).toBe(amount);
      expect(payload.total_amount).toBe(amount);
    }
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

  it('labels professional role, dietary, accessibility, and heard-about other selections', () => {
    const professional = summarizeForPersistence(
      validBase({
        professional_role: 'other',
        professional_role_other: 'Community organizer',
      }),
    );
    expect(professional.payload.professional_role).toBe('Other: Community organizer');
    expect(
      summarizeForPersistence(
        validBase({ professional_role: 'other', professional_role_other: '  ' }),
      ).payload.professional_role,
    ).toBe('Other');

    const dietary = summarizeForPersistence(
      validBase({
        dietary_requirements: 'other',
        dietary_other: 'No shellfish',
      }),
    );
    expect(dietary.payload.dietary_requirements).toBe('Other: No shellfish');
    expect(
      summarizeForPersistence(
        validBase({ dietary_requirements: 'other', dietary_other: '   ' }),
      ).payload.dietary_requirements,
    ).toBe('Other');

    const withDetail = summarizeForPersistence(
      validBase({
        accessibility_needs: 'other',
        accessibility_other: '  ASL interpreter  ',
        heard_about_us: ['other'],
        heard_about_other: 'Colleague referral',
      }),
    );
    expect(withDetail.payload.accessibility_needs).toBe('Other: ASL interpreter');
    expect(withDetail.payload.heard_about_us).toEqual(['Other: Colleague referral']);

    const withoutDetail = summarizeForPersistence(
      validBase({
        accessibility_needs: 'other',
        accessibility_other: '   ',
        heard_about_us: ['other'],
        heard_about_other: '',
      }),
    );
    expect(withoutDetail.payload.accessibility_needs).toBe('Other');
    expect(withoutDetail.payload.heard_about_us).toEqual(['Other']);
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

describe('registrationFormSchema superRefine', () => {
  it('requires housing room and occupancy for housing-enabled conferences', () => {
    const result = registrationFormSchema.safeParse(
      validBase({
        conference_slug: 'usa-2026',
        needs_housing: 'yes',
        room_type: null,
        occupancy_type: null,
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'room_type')).toBe(true);
      expect(result.error.issues.some((issue) => issue.path[0] === 'occupancy_type')).toBe(true);
    }
  });

  it('surfaces student-only, student-catalog, and general tier errors', () => {
    expect(
      registrationFormSchema.safeParse(
        validBase({ is_student: false, registration_type: 'diaspora_student' }),
      ).success,
    ).toBe(false);
    expect(
      registrationFormSchema.safeParse(
        validBase({
          conference_slug: 'usa-2026',
          is_student: true,
          registration_type: 'conference_only',
        }),
      ).success,
    ).toBe(false);
    expect(
      registrationFormSchema.safeParse(
        validBase({
          conference_slug: 'ghana-2027',
          country: 'US',
          registration_type: 'african_students',
        }),
      ).success,
    ).toBe(false);
  });

  it('rejects invalid LinkedIn URLs', () => {
    expect(
      registrationFormSchema.safeParse(validBase({ linkedin_url: 'not-a-url' })).success,
    ).toBe(false);
  });
});

describe('summarizeForPersistence label branches', () => {
  it('formats every enum label variant', () => {
    for (const professional_role of professionalRoles) {
      if (professional_role === 'other') continue;
      expect(
        summarizeForPersistence(validBase({ professional_role })).payload.professional_role.length,
      ).toBeGreaterThan(0);
    }
    for (const dietary_requirements of dietaryOptions) {
      if (dietary_requirements === 'other') continue;
      expect(
        summarizeForPersistence(validBase({ dietary_requirements })).payload.dietary_requirements.length,
      ).toBeGreaterThan(0);
    }
    for (const accessibility_needs of accessibilityOptions) {
      if (accessibility_needs === 'other') continue;
      expect(
        summarizeForPersistence(validBase({ accessibility_needs })).payload.accessibility_needs.length,
      ).toBeGreaterThan(0);
    }
    for (const heard of heardAboutOptions) {
      if (heard === 'other') continue;
      expect(
        summarizeForPersistence(validBase({ heard_about_us: [heard] })).payload.heard_about_us[0]?.length,
      ).toBeGreaterThan(0);
    }
  });
});

describe('registrationCrossFieldMessage', () => {
  it('requires housing selections for housing-enabled conferences', () => {
    expect(
      registrationCrossFieldMessage(
        'room_type',
        validBase({ conference_slug: 'usa-2026', needs_housing: 'yes', room_type: null }),
      ),
    ).toMatch(/room type/i);
    expect(
      registrationCrossFieldMessage(
        'occupancy_type',
        validBase({ conference_slug: 'usa-2026', needs_housing: 'yes', occupancy_type: null }),
      ),
    ).toMatch(/occupancy/i);
    expect(
      registrationCrossFieldMessage(
        'occupancy_type',
        validBase({
          conference_slug: 'usa-2026',
          needs_housing: 'yes',
          room_type: 'A',
          occupancy_type: 'shared',
        }),
      ),
    ).toBeUndefined();
  });

  it('explains student-only and student-catalog mismatches', () => {
    expect(
      registrationCrossFieldMessage(
        'registration_type',
        validBase({ is_student: false, registration_type: 'diaspora_student' }),
      ),
    ).toMatch(/students only/i);
    expect(
      registrationCrossFieldMessage(
        'registration_type',
        validBase({
          conference_slug: 'usa-2026',
          is_student: true,
          registration_type: 'conference_only',
        }),
      ),
    ).toMatch(/available to students/i);
    expect(
      registrationCrossFieldMessage(
        'is_student',
        validBase({
          conference_slug: 'ghana-2027',
          country: 'US',
          registration_type: 'african_students',
        }),
      ),
    ).toMatch(/available for this conference/i);
  });
});

describe('assertPricingMatches', () => {
  it('accepts rows that match canonical pricing', () => {
    const { payload } = summarizeForPersistence(validBase());
    expect(assertPricingMatches(payload)).toBe(true);
  });

  it('rejects non-numeric stored amounts', () => {
    expect(
      assertPricingMatches({
        registration_type: 'diaspora_nurses_allied_health',
        needs_housing: false,
        room_type: null,
        occupancy_type: null,
        registration_amount: 'not-a-number',
        housing_amount: 0,
        total_amount: 250,
      }),
    ).toBe(false);
  });

  it('rejects tampered totals', () => {
    expect(
      assertPricingMatches({
        registration_type: 'diaspora_nurses_allied_health',
        needs_housing: false,
        room_type: null,
        occupancy_type: null,
        registration_amount: 250,
        housing_amount: 0,
        total_amount: 999,
      }),
    ).toBe(false);
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

  it('surfaces student-only ticket error', () => {
    const values = validBase({
      is_student: false,
      registration_type: 'diaspora_student',
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
    const withDeps = registrationFieldValidators('registration_type', ['is_student']);
    expect(withDeps).toHaveProperty('onChangeListenTo', ['is_student']);
  });
});

describe('summarizeForPersistence optional fields', () => {
  it('stores null for blank optional strings and other labels without detail', () => {
    expect(summarizeForPersistence(validBase({ department: 'Cardiology' })).payload.department).toBe(
      'Cardiology',
    );
    expect(summarizeForPersistence(validBase({ department: undefined })).payload.department).toBeNull();
    const persisted = summarizeForPersistence(
      validBase({
        department: '   ',
        additional_notes: '',
        professional_role: 'other',
        professional_role_other: 'Custom role',
        dietary_requirements: 'other',
        dietary_other: 'No shellfish',
        accessibility_needs: 'other',
        accessibility_other: '  ',
        heard_about_us: ['other'],
        heard_about_other: 'Friend',
      }),
    );
    expect(persisted.payload.department).toBeNull();
    expect(persisted.payload.additional_notes).toBeNull();
    expect(persisted.payload.professional_role).toBe('Other: Custom role');
    expect(persisted.payload.dietary_requirements).toBe('Other: No shellfish');
    expect(persisted.payload.accessibility_needs).toBe('Other');
    expect(persisted.payload.heard_about_us).toEqual(['Other: Friend']);
  });

  it('persists housing fields when housing is enabled', () => {
    const persisted = summarizeForPersistence(
      validBase({
        needs_housing: 'yes',
        room_type: 'A',
        occupancy_type: 'shared',
      }),
      'usa-2026',
      true,
    );
    expect(persisted.payload.room_type).toBe('A');
    expect(persisted.payload.occupancy_type).toBe('shared');
  });

  it('stores null housing selections when values are omitted', () => {
    const persisted = summarizeForPersistence(
      validBase({
        needs_housing: 'yes',
        room_type: undefined,
        occupancy_type: undefined,
      }),
      'usa-2026',
      true,
    );
    expect(persisted.payload.room_type).toBeNull();
    expect(persisted.payload.occupancy_type).toBeNull();
  });

  it('formats other labels when detail fields are omitted', () => {
    const persisted = summarizeForPersistence(
      validBase({
        professional_role: 'other',
        dietary_requirements: 'other',
        accessibility_needs: 'other',
        heard_about_us: ['other'],
        professional_role_other: undefined,
        dietary_other: undefined,
        accessibility_other: undefined,
        heard_about_other: undefined,
      }),
    );
    expect(persisted.payload.professional_role).toBe('Other');
    expect(persisted.payload.dietary_requirements).toBe('Other');
    expect(persisted.payload.accessibility_needs).toBe('Other');
    expect(persisted.payload.heard_about_us).toEqual(['Other']);
  });

  it('assertPricingMatches uses room fields when housing is enabled', () => {
    const { payload } = summarizeForPersistence(
      validBase({
        needs_housing: 'yes',
        room_type: 'A',
        occupancy_type: 'shared',
        registration_type: 'conference_only',
      }),
      'usa-2026',
      true,
    );
    expect(assertPricingMatches(payload)).toBe(true);
  });

  it('assertPricingMatches ignores room fields when housing is disabled', () => {
    expect(
      assertPricingMatches({
        registration_type: 'diaspora_nurses_allied_health',
        needs_housing: false,
        room_type: 'A',
        occupancy_type: 'shared',
        registration_amount: 250,
        housing_amount: 0,
        total_amount: 250,
      }),
    ).toBe(true);
  });
});
