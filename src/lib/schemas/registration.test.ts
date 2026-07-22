import { describe, expect, it } from 'vitest';

import {
  registrationFieldMessage,
  registrationFieldValidators,
  registrationFormSchema,
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
    registration_type: 'conference_only',
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

  it('requires room_type and occupancy when housing is yes', () => {
    const result = registrationFormSchema.safeParse(
      validBase({
        needs_housing: 'yes',
        room_type: null,
        occupancy_type: null,
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain('room_type');
      expect(paths).toContain('occupancy_type');
    }
  });

  it('does not require room fields when housing is no (even if stale values remain)', () => {
    const result = registrationFormSchema.safeParse(
      validBase({
        needs_housing: 'no',
        room_type: 'A',
        occupancy_type: 'single',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('passes when housing yes has room and occupancy', () => {
    const result = registrationFormSchema.safeParse(
      validBase({
        needs_housing: 'yes',
        room_type: 'B',
        occupancy_type: 'shared',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('requires student registration tier when is_student is true', () => {
    const result = registrationFormSchema.safeParse(
      validBase({
        is_student: true,
        registration_type: 'conference_only',
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === 'registration_type'),
      ).toBe(true);
    }
  });
});

describe('registrationFieldMessage / validators', () => {
  it('surfaces housing room errors even when other required fields are empty', () => {
    const values = validBase({
      first_name: '',
      needs_housing: 'yes',
      room_type: null,
      occupancy_type: null,
    });
    expect(registrationFieldMessage('room_type', values)).toMatch(/room type/i);
    expect(registrationFieldMessage('occupancy_type', values)).toMatch(
      /occupancy/i,
    );
  });

  it('returns heard_about message only for that field', () => {
    const values = validBase({ heard_about_us: [], first_name: '' });
    expect(registrationFieldMessage('heard_about_us', values)).toMatch(
      /select at least one/i,
    );
    expect(registrationFieldMessage('first_name', values)).toMatch(/required/i);
    expect(registrationFieldMessage('heard_about_us', validBase())).toBeUndefined();
  });

  it('exposes onChange and onSubmit validators (not onBlur)', () => {
    const validators = registrationFieldValidators('heard_about_us');
    expect(validators).toHaveProperty('onChange');
    expect(validators).toHaveProperty('onSubmit');
    expect(validators).not.toHaveProperty('onBlur');
  });
});
