import { describe, expect, it } from 'vitest';

import {
  DuplicateRegistrationError,
  InvalidConferenceError,
  InvalidCountryError,
  InvalidHousingSelectionError,
  InvalidRegistrationTierError,
} from '@/lib/errors';

describe('registration errors', () => {
  it('exposes stable names and messages', () => {
    expect(new DuplicateRegistrationError()).toMatchObject({
      name: 'DuplicateRegistrationError',
      message: expect.stringMatching(/already registered/i),
    });
    expect(new InvalidCountryError()).toMatchObject({
      name: 'InvalidCountryError',
      message: expect.stringMatching(/country/i),
    });
    expect(new InvalidConferenceError()).toMatchObject({
      name: 'InvalidConferenceError',
      message: expect.stringMatching(/not open/i),
    });
    expect(new InvalidRegistrationTierError()).toMatchObject({
      name: 'InvalidRegistrationTierError',
      message: expect.stringMatching(/not available/i),
    });
    expect(new InvalidHousingSelectionError()).toMatchObject({
      name: 'InvalidHousingSelectionError',
      message: expect.stringMatching(/room type/i),
    });
  });
});
