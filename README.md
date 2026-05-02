# A-DNA conference registration

Next.js app for the **A-DNA Global Conference USA 2026** registration flow: multi-step form, Supabase-backed data, **Zeffy** checkout, confirmation email via **Resend**, and Playwright end-to-end tests.

## Stack

- **Next.js** (App Router), **React**, **TypeScript**, **Tailwind CSS**
- **Supabase** — Postgres + `@supabase/supabase-js` (countries catalog, server admin client)
- **TanStack Form** + **Zod** — registration validation
- **Playwright** — E2E tests under `e2e/`

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
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; used for admin/catalog reads — never expose to the client |
| `NEXT_PUBLIC_ZEFFY_CHECKOUT_URL` | Default Zeffy URL (full ticketing page). Always required as fallback. |
| `ZEFFY_CHECKOUT_URL_CONFERENCE_ONLY` | Optional per-tier direct checkout links — see below |
| `ZEFFY_CHECKOUT_URL_STUDENT_CONFERENCE` | Optional |
| `ZEFFY_CHECKOUT_URL_RECEPTION_ONLY` | Optional |
| `ZEFFY_CHECKOUT_URL_CONFERENCE_AND_RECEPTION` | Optional |
| `ZEFFY_CHECKOUT_URL_CONFERENCE_AND_RECEPTION_STUDENT` | Optional |
| `ZEFFY_API_KEY` | Server-side Zeffy API key |
| `ZEFFY_CAMPAIGN_ID` | Optional; narrows payment listing |
| `ZEFFY_WEBHOOK_BEARER` | Optional; `Authorization: Bearer …` for webhooks |
| `RESEND_API_KEY` | Email sending |
| `EMAIL_FROM` | Resend “from” address |
| `EMAIL_REPLY_TO` | Reply-to for transactional mail |

On Vercel, `VERCEL_URL` is set automatically; `NEXT_PUBLIC_APP_URL` should match your production domain in settings.

**Tier-specific Zeffy URLs:** For each registration tier, you can set the matching `ZEFFY_CHECKOUT_URL_*` env var to a Zeffy share/deep link that opens **that ticket only** (so users skip the full grid). Payment init reads `registration_type` from the saved registration and picks that URL. If unset for a tier, the app uses `NEXT_PUBLIC_ZEFFY_CHECKOUT_URL`. Registrations **with housing** always use the default campaign URL, because the total usually exceeds a single ticket link.

### Database

SQL migrations live in `supabase/migrations/`. Apply them to your Supabase project (SQL editor or CLI) so public reads (e.g. countries) match the app.

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
