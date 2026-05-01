import { expect, test } from '@playwright/test';

const SECTION_IDS = [
  'personal',
  'professional',
  'location',
  'preferences',
  'housing',
  'heard',
  'social',
  'payment',
] as const;

test.describe('Conference registration page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
  });

  test('loads with conference registration title', async ({ page }) => {
    await expect(page).toHaveTitle(/Conference Registration · A-DNA Global Conference USA 2026/);
  });

  test('renders hero and checkout messaging', async ({ page }) => {
    await expect(page.locator('#register-hero-title')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'A-DNA Global Conference USA',
    );
    await expect(page.getByText('Registration open')).toBeVisible();
    await expect(page.getByText('Voices of Change:', { exact: false })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Conference details' })).toBeVisible();
    await expect(page.getByText('August 21–22, 2026')).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Conference details' })
        .getByText(/Johns Hopkins Medical Campus · Baltimore, MD/),
    ).toBeVisible();
    await expect(page.getByText(/Secure checkout with Zeffy/)).toBeVisible();
    await expect(page.getByRole('img', { name: /A-DNA community members gathered for the conference/i })).toBeVisible();
  });

  test('renders community spotlight block', async ({ page }) => {
    await expect(page.locator('#community-spotlight-heading')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /The community you.*re joining/i }),
    ).toBeVisible();
    await expect(page.getByText('Together across borders')).toBeVisible();
    await expect(page.getByText('Mentorship & scholarships')).toBeVisible();
    await expect(page.getByText('Policy & advocacy')).toBeVisible();
    await expect(page.getByText('Global gatherings')).toBeVisible();
    await expect(
      page.getByRole('img', {
        name: /African-Diaspora nursing leaders and clinicians together/i,
      }),
    ).toBeVisible();
  });

  test('does not show failed country catalog banner when E2E fixtures load', async ({
    page,
  }) => {
    await expect(page.getByRole('status').filter({ hasText: /could not be loaded/i })).toHaveCount(
      0,
    );
    await expect(page.locator('#registration-field-country')).toBeEnabled();
  });

  test('registration form shell and all sections mount', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: /Registration progress/i })).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeVisible();

    for (const id of SECTION_IDS) {
      await expect(page.locator(`#section-${id}`)).toBeAttached();
    }

    await expect(page.locator('#conference-registration-form')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Personal Information' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Professional Background' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Location' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Conference Preferences' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Housing' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How Did You Hear About Us' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Social Media' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
  });

  test('section jump navigation targets every section', async ({ page }) => {
    for (const id of SECTION_IDS) {
      await page.locator(`button[data-section-nav="${id}"]`).click();
      await expect(page.locator(`#section-${id}`)).toBeInViewport();
    }
  });

  test('footer shows nonprofit disclaimer and contact email', async ({ page }) => {
    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();
    await expect(
      footer.getByText(/African-Diaspora Nursing Alliance \(A-DNA\) is organized as a 501\(c\)\(3\) nonprofit/i),
    ).toBeVisible();
    await expect(footer.getByRole('link', { name: /info@g-dna\.org/i })).toHaveAttribute(
      'href',
      'mailto:info@g-dna.org',
    );
  });
});
