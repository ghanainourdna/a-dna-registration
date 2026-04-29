-- Run in Supabase SQL editor or via supabase db push

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create table if not exists public.conference_registrations (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_initial text,
  last_name text not null,
  email citext not null unique,
  phone text not null,
  professional_role text not null,
  highest_degree text not null,
  institution text not null,
  department text,
  is_student boolean not null default false,
  country text not null,
  state_region text not null,
  city text not null,
  dietary_requirements text not null,
  accessibility_needs text not null,
  additional_notes text,
  needs_housing boolean not null default false,
  room_type text,
  occupancy_type text,
  heard_about_us jsonb not null default '[]'::jsonb,
  instagram_handle text,
  x_handle text,
  linkedin_url text,
  facebook_handle text,
  other_social text,
  registration_type text not null,
  registration_amount numeric(12, 2) not null,
  housing_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null,
  payment_status text not null default 'pending'
    constraint conference_registrations_payment_status_check
      check (payment_status in ('pending', 'paid', 'failed')),
  paystack_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conference_registrations_room_type_check
    check (room_type is null or room_type in ('A', 'B')),
  constraint conference_registrations_occupancy_type_check
    check (occupancy_type is null or occupancy_type in ('single', 'shared'))
);

comment on table public.conference_registrations is 'A-DNA Global Conference USA 2026 attendee registrations';

create index if not exists conference_registrations_payment_status_idx
  on public.conference_registrations (payment_status);

create or replace function public.set_conference_registrations_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists conference_registrations_set_updated_at on public.conference_registrations;
create trigger conference_registrations_set_updated_at
  before update on public.conference_registrations
  for each row
  execute procedure public.set_conference_registrations_updated_at();

alter table public.conference_registrations enable row level security;

-- Adjust policies for your app: backend uses service role and bypasses RLS.
