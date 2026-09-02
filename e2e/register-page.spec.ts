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
    await expect(page).toHaveTitle(/Conference Registration · A-DNA Ghana Conference 2027/);
  });

  test('renders hero and checkout messaging', async ({ page }) => {
    await expect(page.locator('#register-hero-title')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'A-DNA Ghana Conference 2027',
    );
    await expect(page.getByText('Registration open')).toBeVisible();
    await expect(page.getByText('The Future Of African HealthCare', { exact: false })).toBeVisible();
    await expect(page.getByText(/Diaspora Partnership for sustainable Impact/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Conference details' })).toBeVisible();
    await expect(page.getByText('7–9 January 2027')).toBeVisible();
    await expect(
      page
        .getByRole('list', { name: 'Conference details' })
        .getByText(/Kofi Ohene-Konadu Auditorium, UPSA, Accra, Ghana/),
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

  test('country list can switch between African countries and all countries', async ({
    page,
  }) => {
    const country = page.locator('#registration-field-country');
    const africa = page.getByRole('radio', { name: 'African countries' });
    const all = page.getByRole('radio', { name: 'All countries' });

    await page.locator('button[data-section-nav="location"]').click();
    await expect(africa).toBeChecked();
    await expect(country.locator('option[value="GH"]')).toHaveCount(1);
    await expect(country.locator('option[value="NG"]')).toHaveCount(1);
    await expect(country.locator('option[value="KE"]')).toHaveCount(1);
    await expect(country.locator('option[value="ZA"]')).toHaveCount(1);
    await expect(country.locator('option[value="EG"]')).toHaveCount(1);
    await expect(country.locator('option[value="US"]')).toHaveCount(0);

    await all.click();
    await expect(all).toBeChecked();
    await expect(country.locator('option[value="GH"]')).toHaveCount(1);
    await expect(country.locator('option[value="NG"]')).toHaveCount(1);
    await expect(country.locator('option[value="US"]')).toHaveCount(1);
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
