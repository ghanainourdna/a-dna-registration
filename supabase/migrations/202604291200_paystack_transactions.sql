-- Paystack webhook payloads and transaction snapshots (immutable audit).

create table if not exists public.paystack_transactions (
  id uuid primary key default gen_random_uuid(),
  paystack_id bigint not null unique,
  event text not null,
  reference text not null,
  registration_id uuid references public.conference_registrations (id) on delete set null,
  amount_cents integer not null,
  currency text not null default 'USD',
  status text not null,
  channel text,
  paid_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.paystack_transactions is 'Immutable copies of Paystack webhook payloads (chiefly charge.*) keyed by Paystack transaction id';

create index if not exists paystack_transactions_reference_idx
  on public.paystack_transactions (reference);

create index if not exists paystack_transactions_registration_id_idx
  on public.paystack_transactions (registration_id);

create index if not exists paystack_transactions_event_idx
  on public.paystack_transactions (event);

alter table public.paystack_transactions enable row level security;
