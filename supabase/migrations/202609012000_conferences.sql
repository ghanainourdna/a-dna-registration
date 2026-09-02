-- Multi-conference support: registrations belong to a conference; email is unique per conference.

create table if not exists public.conferences (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    constraint conferences_slug_key unique
    constraint conferences_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  tagline text,
  theme text,
  dates_label text not null,
  location_label text not null,
  reception_label text,
  zeffy_checkout_url text,
  world_country text not null default 'all'
    constraint conferences_world_country_check check (world_country in ('africa', 'all')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.conferences is
  'A-DNA conferences. conference_registrations.conference_id points here.';

comment on column public.conferences.world_country is
  'Registration country catalog: africa = African countries, all = full ISO list.';

insert into public.conferences (
  slug,
  title,
  tagline,
  theme,
  dates_label,
  location_label,
  reception_label,
  world_country
)
values
  (
    'usa-2026',
    'A-DNA Global Conference USA 2026',
    'Voices of Change: Translating Innovation into Action for Global Health',
    null,
    'August 21–22, 2026',
    'Johns Hopkins Medical Campus · Baltimore, MD',
    'Reception · Aug 22, 6:00 PM',
    'all'
  ),
  (
    'ghana-2027',
    'A-DNA Ghana Conference 2027',
    'The Future Of African HealthCare',
    'Diaspora Partnership for sustainable Impact',
    '7–9 January 2027',
    'Kofi Ohene-Konadu Auditorium, UPSA, Accra, Ghana',
    null,
    'africa'
  )
on conflict (slug) do nothing;

alter table public.conference_registrations
  add column if not exists conference_id uuid references public.conferences (id);

update public.conference_registrations r
set conference_id = c.id
from public.conferences c
where r.conference_id is null
  and c.slug = 'usa-2026';

alter table public.conference_registrations
  alter column conference_id set not null;

alter table public.conference_registrations
  drop constraint if exists conference_registrations_email_key;

drop index if exists conference_registrations_email_key;

create unique index if not exists conference_registrations_conference_email_uidx
  on public.conference_registrations (conference_id, email);

create index if not exists conference_registrations_conference_id_idx
  on public.conference_registrations (conference_id);

comment on column public.conference_registrations.conference_id is
  'Conference this registration belongs to. Email uniqueness is scoped to this id.';

comment on table public.conference_registrations is
  'Attendee registrations for an A-DNA conference (see conference_id).';

grant usage on schema public to anon, authenticated;
grant select on table public.conferences to anon, authenticated, service_role;
grant select on table public.conferences to public;

alter table public.conferences enable row level security;

drop policy if exists conferences_select_active on public.conferences;
create policy conferences_select_active
  on public.conferences
  for select
  to public
  using (is_active = true);
