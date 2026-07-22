import { expect, test } from '@playwright/test';

test.describe('Registration validation interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
  });

  test('heard-about option toggles update aria-checked and clear required error after submit', async ({
    page,
  }) => {
    const heardGroup = page.locator('#registration-field-heard_about_us');
    await heardGroup.scrollIntoViewIfNeeded();

    const website = heardGroup.getByRole('checkbox', {
      name: /A-DNA\/G-DNA Website/i,
    });
    await expect(website).toHaveAttribute('aria-checked', 'false');

    // Trigger form validation without filling the rest of the form.
    await page.locator('#section-payment').scrollIntoViewIfNeeded();
    await page
      .locator('#conference-registration-form')
      .evaluate((form) => {
        if (form instanceof HTMLFormElement) form.requestSubmit();
      });

    await expect(
      page.getByRole('alert').filter({ hasText: /select at least one/i }),
    ).toBeVisible();

    await heardGroup.scrollIntoViewIfNeeded();
    await website.click();
    await expect(website).toHaveAttribute('aria-checked', 'true');

    await page.locator('#section-payment').scrollIntoViewIfNeeded();
    await page
      .locator('#conference-registration-form')
      .evaluate((form) => {
        if (form instanceof HTMLFormElement) form.requestSubmit();
      });

    await expect(
      page.getByRole('alert').filter({ hasText: /select at least one/i }),
    ).toHaveCount(0);
  });

  test('housing yes without room shows errors; switching to no clears room requirements', async ({
    page,
  }) => {
    const housing = page.locator('#registration-field-needs_housing');
    await housing.scrollIntoViewIfNeeded();

    await housing.getByRole('radio', { name: 'Yes' }).click();
    await expect(page.locator('#registration-field-room_type')).toBeVisible();
    await expect(
      page.locator('#registration-field-occupancy_type'),
    ).toBeVisible();

    await page.locator('#section-payment').scrollIntoViewIfNeeded();
    await page
      .locator('#conference-registration-form')
      .evaluate((form) => {
        if (form instanceof HTMLFormElement) form.requestSubmit();
      });

    await expect(
      page.getByRole('alert').filter({ hasText: /select a room type/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: /occupancy/i }),
    ).toBeVisible();

    await housing.scrollIntoViewIfNeeded();
    await housing.getByRole('radio', { name: 'No' }).click();
    await expect(page.locator('#registration-field-room_type')).toHaveCount(0);
    await expect(
      page.locator('#registration-field-occupancy_type'),
    ).toHaveCount(0);

    await page.locator('#section-payment').scrollIntoViewIfNeeded();
    await page
      .locator('#conference-registration-form')
      .evaluate((form) => {
        if (form instanceof HTMLFormElement) form.requestSubmit();
      });

    await expect(
      page.getByRole('alert').filter({ hasText: /select a room type/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('alert').filter({ hasText: /select single or shared occupancy/i }),
    ).toHaveCount(0);
  });

  test('student and registration type use button radios', async ({ page }) => {
    const student = page.locator('#registration-field-is_student');
    await student.scrollIntoViewIfNeeded();
    await expect(student.getByRole('radio', { name: 'Yes' })).toBeVisible();
    await expect(student.locator('input[type="radio"]')).toHaveCount(0);

    await student.getByRole('radio', { name: 'Yes' }).click();
    await expect(student.getByRole('radio', { name: 'Yes' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    const tiers = page.locator('#registration-field-registration_type');
    await tiers.scrollIntoViewIfNeeded();
    await expect(tiers.getByRole('radio').first()).toBeVisible();
    await expect(tiers.locator('input[type="radio"]')).toHaveCount(0);
  });
});
