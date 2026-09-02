import { expect, test } from '@playwright/test';

test.describe('Registration validation interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await expect(
      page.locator('nav[aria-label*="Registration progress"][data-nav-ready="true"]'),
    ).toBeVisible({ timeout: 30_000 });
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

  test('housing is disabled and does not require a room selection', async ({
    page,
  }) => {
    await page.locator('button[data-section-nav="housing"]').click();
    await expect(page.locator('#section-housing')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /housing is disabled/i })).toBeVisible();
    await expect(page.locator('#registration-field-needs_housing')).toHaveCount(0);
    await expect(page.locator('#registration-field-room_type')).toHaveCount(0);

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

  test('non-students see Ghana conference tickets; students see reception only', async ({
    page,
  }) => {
    const student = page.locator('#registration-field-is_student');
    await student.scrollIntoViewIfNeeded();
    await expect(student.getByRole('radio', { name: 'Yes' })).toBeVisible();
    await expect(student.locator('input[type="radio"]')).toHaveCount(0);

    const tiers = page.locator('#registration-field-registration_type');
    await tiers.scrollIntoViewIfNeeded();
    await expect(
      tiers.getByRole('radio', {
        name: /Diaspora Nurses, Midwives and Allied Health/i,
      }),
    ).toBeVisible();
    await expect(
      tiers.getByRole('radio', { name: /Diaspora Physicians/i }),
    ).toBeVisible();
    await expect(
      tiers.getByRole('radio', {
        name: /Low- and Moderate-Income Nurses, Midwives and Allied Health/i,
      }),
    ).toBeVisible();
    await expect(tiers.getByRole('radio', { name: /Reception/i })).toHaveCount(0);

    await student.getByRole('radio', { name: 'Yes' }).click();
    await expect(student.getByRole('radio', { name: 'Yes' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await tiers.scrollIntoViewIfNeeded();
    await expect(
      tiers.getByRole('radio', {
        name: /Diaspora Nurses, Midwives and Allied Health/i,
      }),
    ).toHaveCount(0);
    await expect(
      tiers.getByRole('radio', { name: /Diaspora Physicians/i }),
    ).toHaveCount(0);
    await expect(
      tiers.getByRole('radio', {
        name: /Low- and Moderate-Income Nurses, Midwives and Allied Health/i,
      }),
    ).toHaveCount(0);
    await expect(tiers.getByRole('radio', { name: /Reception/i })).toBeVisible();
    await expect(tiers.getByRole('radio')).toHaveCount(1);
  });
});
