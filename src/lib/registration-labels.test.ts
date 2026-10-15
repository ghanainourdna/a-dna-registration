import { describe, expect, it } from 'vitest';

import { sortRegistrationTiersByWeight } from '@/lib/registration-labels';

describe('sortRegistrationTiersByWeight', () => {
  it('orders Ghana diaspora and Africa tiers by weight (highest first)', () => {
    expect(
      sortRegistrationTiersByWeight([
        'reception',
        'low_moderate_income_physician',
        'diaspora_physicians',
        'african_students',
        'african_nurses_midwives',
      ]),
    ).toEqual([
      'african_nurses_midwives',
      'african_students',
      'diaspora_physicians',
      'low_moderate_income_physician',
      'reception',
    ]);
  });

  it('orders the Africa Paystack catalog', () => {
    expect(
      sortRegistrationTiersByWeight([
        'african_students',
        'reception_dinner',
        'african_physicians_allied',
        'african_nurses_midwives',
      ]),
    ).toEqual([
      'african_nurses_midwives',
      'african_students',
      'african_physicians_allied',
      'reception_dinner',
    ]);
  });
});
