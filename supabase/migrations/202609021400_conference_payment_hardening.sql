-- Conference catalog knobs + fair payment sync + exclusive Zeffy payment claims.

alter table public.conferences
  add column if not exists housing_enabled boolean;

alter table public.conferences
  add column if not exists zeffy_campaign_id text;

update public.conferences
set housing_enabled = true
where slug = 'usa-2026'
  and (housing_enabled is null);

update public.conferences
set housing_enabled = false
where slug = 'ghana-2027'
  and (housing_enabled is null);

update public.conferences
set housing_enabled = false
where housing_enabled is null;

alter table public.conferences
  alter column housing_enabled set default false;

alter table public.conferences
  alter column housing_enabled set not null;

comment on column public.conferences.housing_enabled is
  'When false, registration form disables housing and persists needs_housing=false.';

comment on column public.conferences.zeffy_campaign_id is
  'Optional Zeffy campaign id used to scope payment reconciliation for this conference.';

alter table public.conference_registrations
  add column if not exists payment_sync_checked_at timestamptz;

comment on column public.conference_registrations.payment_sync_checked_at is
  'Last time the payment sync cron inspected this pending row. Used for fair rotation.';

create index if not exists conference_registrations_payment_sync_checked_at_idx
  on public.conference_registrations (payment_sync_checked_at nulls first, created_at desc)
  where payment_status = 'pending';

-- One Zeffy payment (or checkout token) may confirm at most one registration.
create unique index if not exists conference_registrations_checkout_correlation_uidx
  on public.conference_registrations (checkout_correlation_reference)
  where checkout_correlation_reference is not null;
