import { FieldApi, FormApi } from '@tanstack/form-core';
import { describe, expect, it } from 'vitest';

import {
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
    heard_about_us: [],
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

describe('registration form submit validation', () => {
  it('clears heard_about errors on change and allows resubmit', async () => {
    let submitted = false;
    const form = new FormApi({
      defaultValues: validBase(),
      canSubmitWhenInvalid: true,
      validators: { onSubmit: registrationFormSchema },
      onSubmit: async () => {
        submitted = true;
      },
    });
    form.mount();

    const heard = new FieldApi({
      form,
      name: 'heard_about_us',
      validators: registrationFieldValidators('heard_about_us'),
    });
    heard.mount();

    await form.handleSubmit();
    expect(submitted).toBe(false);
    expect(heard.state.meta.errors.length).toBeGreaterThan(0);

    heard.handleChange(['website']);
    await Promise.resolve();
    expect(heard.state.meta.isValid).toBe(true);

    await form.handleSubmit();
    expect(submitted).toBe(true);
  });

  it('revalidates on submit after silent value update (mobile race)', async () => {
    let submitted = false;
    const form = new FormApi({
      defaultValues: validBase(),
      canSubmitWhenInvalid: true,
      validators: { onSubmit: registrationFormSchema },
      onSubmit: async () => {
        submitted = true;
      },
    });
    form.mount();

    const heard = new FieldApi({
      form,
      name: 'heard_about_us',
      validators: registrationFieldValidators('heard_about_us'),
    });
    heard.mount();

    await form.handleSubmit();
    expect(submitted).toBe(false);

    // Value updated without running field change validators (stale error map).
    form.setFieldValue('heard_about_us', ['instagram'], { dontValidate: true });
    expect(heard.state.meta.isValid).toBe(false);

    await form.handleSubmit();
    expect(submitted).toBe(true);
    expect(heard.state.meta.isValid).toBe(true);
  });

  it('allows submit when housing is yes without room fields', async () => {
    let submitted = false;
    const form = new FormApi({
      defaultValues: validBase({
        needs_housing: 'yes',
        room_type: null,
        occupancy_type: null,
        heard_about_us: ['website'],
      }),
      canSubmitWhenInvalid: true,
      validators: { onSubmit: registrationFormSchema },
      onSubmit: async () => {
        submitted = true;
      },
    });
    form.mount();

    await form.handleSubmit();
    expect(submitted).toBe(true);
  });

  it('blocks submit when canSubmitWhenInvalid is false and errors are stale', async () => {
    let submitted = false;
    const form = new FormApi({
      defaultValues: validBase(),
      canSubmitWhenInvalid: false,
      validators: { onSubmit: registrationFormSchema },
      onSubmit: async () => {
        submitted = true;
      },
    });
    form.mount();

    const heard = new FieldApi({
      form,
      name: 'heard_about_us',
      validators: registrationFieldValidators('heard_about_us'),
    });
    heard.mount();

    await form.handleSubmit();
    form.setFieldValue('heard_about_us', ['website'], { dontValidate: true });
    await form.handleSubmit();
    expect(submitted).toBe(false);
  });
});
