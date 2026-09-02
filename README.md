# A-DNA conference registration

Next.js app for A-DNA conference registration: multi-step form, Supabase-backed data, **Zeffy** checkout, confirmation email via **Resend**, and Playwright end-to-end tests. The default event is **A-DNA Ghana Conference 2027**.

## Stack

- **Next.js** (App Router), **React**, **TypeScript**, **Tailwind CSS**
- **Supabase** - Postgres + `@supabase/supabase-js` (countries catalog, server admin client)
- **TanStack Form** + **Zod** - registration validation
- **Playwright** - E2E tests under `e2e/`

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [pnpm](https://pnpm.io/) (`corepack enable` or install globally)

## Setup

```bash
pnpm install
```

Install Playwright browsers once (needed for E2E):

```bash
pnpm exec playwright install chromium
```

### Environment variables

Copy values from your team or from Vercel project settings. Do not commit real secrets.

| Variable | Notes |
| -------- | ----- |
| `NEXT_PUBLIC_APP_URL` | Public site URL (no trailing slash), e.g. `http://localhost:3000` locally |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; used for admin/catalog reads - never expose to the client |
| `NEXT_PUBLIC_ZEFFY_CHECKOUT_URL` | Default (Ghana 2027) Zeffy campaign URL. |
| `NEXT_PUBLIC_ZEFFY_CHECKOUT_URL_<SLUG>` | Optional conference-specific checkout URL, e.g. `NEXT_PUBLIC_ZEFFY_CHECKOUT_URL_USA_2026`. |
| `ZEFFY_CHECKOUT_URL_*` | Optional per-tier deep links only if Zeffy gives you separate one-ticket URLs |
| `ZEFFY_API_KEY` | Server-side Zeffy API key |
| `ZEFFY_CAMPAIGN_ID` | Ghana 2027 campaign ID fallback; narrows payment reconciliation |
| `ZEFFY_CAMPAIGN_ID_<SLUG>` | Optional conference-specific campaign ID, e.g. `ZEFFY_CAMPAIGN_ID_USA_2026` |
| `ZEFFY_WEBHOOK_BEARER` | Optional; `Authorization: Bearer …` for webhooks |
| `CRON_SECRET` | Required bearer secret for Vercel's daily payment reconciliation cron |
| `ZEFFY_SYNC_SECRET` | Optional manual-sync bearer secret when `CRON_SECRET` is unavailable |
| `RESEND_API_KEY` | Email sending |
| `EMAIL_FROM` | Resend “from” address |
| `EMAIL_REPLY_TO` | Reply-to for transactional mail |

On Vercel, `VERCEL_URL` is set automatically; `NEXT_PUBLIC_APP_URL` should match your production domain in settings.

**Zeffy payment sync:** Webhooks mark a registration `paid` when Zeffy posts `payment.completed`. If that is missed, `/register/success` polls `/api/payment/verify`, and a daily Vercel Cron at `/api/cron/zeffy-payment-sync` walks pending rows, retries unsent confirmation emails, matches succeeded Zeffy payments by conference campaign + registration time + email + amount, and updates `payment_status`. Set `CRON_SECRET` (and `ZEFFY_API_KEY`) in Vercel. Manual run:

```bash
curl -X POST https://campaign.g-dna.org/api/cron/zeffy-payment-sync \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

**Zeffy checkout:** Set `NEXT_PUBLIC_ZEFFY_CHECKOUT_URL` to the campaign page (for Ghana 2027: [The Future of African Healthcare](https://www.zeffy.com/en-US/ticketing/the-future-of-african-healthcare-diaspora-partnerships-for-sustainable-impact)). All registration types use that one URL unless you later add optional per-tier `ZEFFY_CHECKOUT_URL_*` deep links. After Register & Pay, the attendee picks the matching ticket on Zeffy. Ticket options in the form: Diaspora Nurses/Midwives/Allied Health ($250), Diaspora Physicians ($350), Low- and Moderate-Income Nurses/Midwives/Allied Health ($150), and Reception ($150, students only).

### Database

SQL migrations live in `supabase/migrations/`. Apply them to your Supabase project (SQL editor or CLI) so public reads (e.g. countries) match the app.

Set `conferences.zeffy_campaign_id` for every active conference. Reconciliation also applies a
registration-time lower bound and atomically claims each Zeffy payment ID, preventing an older or
already-consumed payment from confirming another registration.

Registrations live in `conference_registrations` and belong to a row in `conferences`. Email uniqueness is per conference (`conference_id` + `email`). `/register` is Ghana 2027 (`ghana-2027`). USA 2026 remains at `/register/usa-2026`. To add another event, create its `conferences` row and an explicit entry in `CONFERENCE_REGISTRATION_CONFIG`, then use `/register/<slug>`. Set `conferences.world_country` to `africa` or `all` to choose which country list the form loads first.

## Scripts

| Command | Description |
| ------- | ----------- |
| `pnpm dev` | Dev server at [http://localhost:3000](http://localhost:3000) (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Run production build locally |
| `pnpm lint` | ESLint |
| `pnpm test:e2e` | Playwright tests (starts Next on port **3333** with fixture countries) |
| `pnpm test:e2e:ui` | Playwright UI mode |
| `pnpm test:e2e:headed` | Playwright headed browsers |

Main registration UI: **`/register`**.

## End-to-end tests

- Playwright uses **`http://127.0.0.1:3333`** by default so a separate `pnpm dev` on port 3000 does not get mistaken for this app.
- Override with `PLAYWRIGHT_BASE_URL` or `PLAYWRIGHT_PORT` if needed.
- Set **`PLAYWRIGHT_REUSE_SERVER=1`** only when you intentionally reuse an already-running dev server that matches the same URL/port and has **`E2E_FIXTURE_COUNTRIES=1`** if tests expect the country fixture path.

## Deploy

Configured for **[Vercel](https://vercel.com/)**: connect the repo, set environment variables, and deploy. Use the same env names as in production for preview deployments where applicable.
