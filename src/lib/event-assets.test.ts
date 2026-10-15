import { describe, expect, it } from 'vitest';

import { REGISTER_PAGE_IMAGES } from '@/lib/event-assets';

describe('REGISTER_PAGE_IMAGES', () => {
  it('points at public registration page assets', () => {
    expect(REGISTER_PAGE_IMAGES.hero).toMatch(/adna-conference-2026-celebration/);
    expect(REGISTER_PAGE_IMAGES.spotlight).toMatch(/adna-conference-2026-13/);
  });
});
