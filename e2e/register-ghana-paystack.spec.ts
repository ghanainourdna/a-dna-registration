import { expect, test } from '@playwright/test';

test.describe('Ghana 2027 Paystack checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await expect(
      page.locator('nav[aria-label*="Registration progress"][data-nav-ready="true"]'),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('Ghana country selection shows Paystack copy and Ghana tickets', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'A-DNA Ghana Conference 2027',
    );

    await page.locator('button[data-section-nav="location"]').click();
    const country = page.locator('#registration-field-country');
    await expect(country.locator('option[value="GH"]')).toHaveCount(1);
    await country.selectOption('GH');
    await expect(country).toHaveValue('GH');
    await expect(page.locator('#conference-registration-form')).toHaveAttribute(
      'data-registration-catalog',
      'africa',
    );

    await page.locator('button[data-section-nav="payment"]').click();
    await expect(page.getByText(/pay via Paystack \(card or mobile money\)/i)).toBeVisible();
    await expect(page.getByText(/pay via Zeffy in the next step/i)).toHaveCount(0);

    const tiers = page.locator('#registration-field-registration_type');
    await expect(tiers.getByRole('radio', { name: /African Students/i })).toBeVisible();
    await expect(tiers.getByRole('radio', { name: /Reception Dinner/i })).toBeVisible();
    await expect(
      tiers.getByRole('radio', { name: /African Physicians and Allied/i }),
    ).toBeVisible();
    await expect(
      tiers.getByRole('radio', { name: /African Nurses and Midwives/i }),
    ).toBeVisible();
    await expect(
      tiers.getByRole('radio', { name: /Diaspora Nurses, Midwives and Allied Health/i }),
    ).toHaveCount(0);
  });

  test('non-African country keeps Zeffy copy on the Ghana form', async ({ page }) => {
    await page.locator('button[data-section-nav="location"]').click();
    await page.getByRole('radio', { name: 'All countries' }).click();
    const country = page.locator('#registration-field-country');
    await expect(country.locator('option[value="US"]')).toHaveCount(1);
    await country.selectOption('US');

    await page.locator('button[data-section-nav="payment"]').click();
    await expect(page.getByText(/pay via Zeffy in the next step/i)).toBeVisible();
    await expect(page.getByText(/pay via Paystack \(card or mobile money\)/i)).toHaveCount(0);

    const tiers = page.locator('#registration-field-registration_type');
    await expect(
      tiers.getByRole('radio', { name: /Diaspora Nurses, Midwives and Allied Health/i }),
    ).toBeVisible();
    await expect(tiers.getByRole('radio', { name: /African Students/i })).toHaveCount(0);
  });
});
