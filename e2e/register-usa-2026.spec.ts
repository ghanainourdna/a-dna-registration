import { expect, test } from '@playwright/test';

test.describe('USA 2026 registration page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register/usa-2026', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await expect(
      page.locator('nav[aria-label*="Registration progress"][data-nav-ready="true"]'),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('shows USA copy, tickets, and housing instead of Ghana defaults', async ({
    page,
  }) => {
    await expect(page).toHaveTitle(/A-DNA Global Conference USA 2026/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'A-DNA Global Conference USA 2026',
    );

    const tiers = page.locator('#registration-field-registration_type');
    await tiers.scrollIntoViewIfNeeded();
    await expect(tiers.getByRole('radio', { name: /Conference Only/i })).toBeVisible();
    await expect(tiers.getByRole('radio', { name: /Virtual/i })).toBeVisible();
    await expect(
      tiers.getByRole('radio', { name: /Diaspora Nurses, Midwives and Allied Health/i }),
    ).toHaveCount(0);

    await page.locator('button[data-section-nav="housing"]').click();
    await expect(page.getByRole('status').filter({ hasText: /housing is disabled/i })).toHaveCount(
      0,
    );
    await expect(page.getByText(/Do you need housing/i)).toBeVisible();
  });
});
