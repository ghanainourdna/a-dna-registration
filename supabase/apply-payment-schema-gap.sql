-- Idempotent production patch: Paystack table, confirmation email, Zeffy finalize RPC.
-- Run in Supabase SQL Editor or: node scripts/apply-payment-schema.mjs

-- === 202604291200_paystack_transactions.sql ===
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

-- === 202608132000_confirmation_email_after_payment.sql ===
alter table public.conference_registrations
  add column if not exists confirmation_email_sent_at timestamptz;

comment on column public.conference_registrations.confirmation_email_sent_at is
  'Set only after Resend accepts the post-payment confirmation email. Null means not delivered.';

-- === 202608132100_confirmation_email_claim_lease.sql ===
alter table public.conference_registrations
  add column if not exists confirmation_email_claimed_at timestamptz,
  add column if not exists confirmation_email_claim_token uuid;

comment on column public.conference_registrations.confirmation_email_claimed_at is
  'Lease start for an in-flight confirmation send. Stale after 10 minutes so retries can reclaim.';

comment on column public.conference_registrations.confirmation_email_claim_token is
  'Opaque token for the active confirmation-email claim. Cleared when sent or released.';

create or replace function public.claim_registration_confirmation_email_send(p_registration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_now timestamptz := now();
  v_lease interval := interval '10 minutes';
begin
  if p_registration_id is null then
    return null;
  end if;

  update public.conference_registrations
  set
    confirmation_email_claimed_at = v_now,
    confirmation_email_claim_token = gen_random_uuid()
  where id = p_registration_id
    and payment_status = 'paid'
    and confirmation_email_sent_at is null
    and (
      confirmation_email_claimed_at is null
      or confirmation_email_claimed_at < v_now - v_lease
    )
  returning confirmation_email_claim_token into v_token;

  return v_token;
end;
$$;

create or replace function public.mark_registration_confirmation_email_sent(
  p_registration_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_registration_id is null or p_claim_token is null then
    return false;
  end if;

  update public.conference_registrations
  set
    confirmation_email_sent_at = now(),
    confirmation_email_claimed_at = null,
    confirmation_email_claim_token = null
  where id = p_registration_id
    and confirmation_email_sent_at is null
    and confirmation_email_claim_token = p_claim_token;

  return found;
end;
$$;

create or replace function public.clear_registration_confirmation_email_claim(
  p_registration_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_registration_id is null or p_claim_token is null then
    return false;
  end if;

  update public.conference_registrations
  set
    confirmation_email_claimed_at = null,
    confirmation_email_claim_token = null
  where id = p_registration_id
    and confirmation_email_sent_at is null
    and confirmation_email_claim_token = p_claim_token;

  return found;
end;
$$;

revoke all on function public.claim_registration_confirmation_email_send(uuid) from public;
revoke all on function public.mark_registration_confirmation_email_sent(uuid, uuid) from public;
revoke all on function public.clear_registration_confirmation_email_claim(uuid, uuid) from public;

grant execute on function public.claim_registration_confirmation_email_send(uuid) to service_role;
grant execute on function public.mark_registration_confirmation_email_sent(uuid, uuid) to service_role;
grant execute on function public.clear_registration_confirmation_email_claim(uuid, uuid) to service_role;

-- === 202609021400_conference_payment_hardening.sql (partial / idempotent) ===
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

do $$
begin
  if exists (
    select 1 from public.conferences where housing_enabled is null limit 1
  ) then
    null;
  else
    alter table public.conferences alter column housing_enabled set not null;
  end if;
exception
  when others then null;
end $$;

comment on column public.conferences.zeffy_campaign_id is
  'Optional Zeffy campaign id used to scope payment reconciliation for this conference.';

alter table public.conference_registrations
  add column if not exists payment_sync_checked_at timestamptz;

create index if not exists conference_registrations_payment_sync_checked_at_idx
  on public.conference_registrations (payment_sync_checked_at nulls first, created_at desc)
  where payment_status = 'pending';

with ranked_references as (
  select
    r.id,
    row_number() over (
      partition by r.checkout_correlation_reference
      order by
        coalesce(a.registration_id = r.id, false) desc,
        (r.payment_status = 'paid') desc,
        r.created_at asc,
        r.id asc
    ) as reference_rank
  from public.conference_registrations r
  left join public.provider_payment_audit a
    on a.provider = 'zeffy'
   and a.external_payment_id = r.checkout_correlation_reference
  where r.checkout_correlation_reference is not null
)
update public.conference_registrations r
set checkout_correlation_reference = null
from ranked_references ranked
where r.id = ranked.id
  and ranked.reference_rank > 1;

create unique index if not exists conference_registrations_checkout_correlation_uidx
  on public.conference_registrations (checkout_correlation_reference)
  where checkout_correlation_reference is not null;

create or replace function public.finalize_zeffy_registration_payment(
  p_registration_id uuid,
  p_external_payment_id text,
  p_amount_cents integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_status text;
  v_existing_reference text;
  v_audit_registration_id uuid;
begin
  if p_registration_id is null
    or nullif(btrim(p_external_payment_id), '') is null
    or p_amount_cents is null
    or p_amount_cents <= 0
  then
    return 'invalid_input';
  end if;

  select payment_status, checkout_correlation_reference
    into v_payment_status, v_existing_reference
  from public.conference_registrations
  where id = p_registration_id
  for update;

  if not found then
    return 'registration_not_found';
  end if;

  if v_payment_status = 'paid' then
    if v_existing_reference = btrim(p_external_payment_id) then
      return 'already_paid';
    end if;
    return 'registration_already_paid';
  end if;

  if v_payment_status <> 'pending' then
    return 'registration_not_pending';
  end if;

  insert into public.provider_payment_audit (
    provider,
    external_payment_id,
    event_type,
    registration_id,
    amount_cents,
    currency,
    status,
    payload
  )
  values (
    'zeffy',
    btrim(p_external_payment_id),
    'payment.reconciled',
    null,
    p_amount_cents,
    'USD',
    'succeeded',
    jsonb_build_object('source', 'api_reconciliation')
  )
  on conflict (provider, external_payment_id) do nothing;

  select registration_id
    into v_audit_registration_id
  from public.provider_payment_audit
  where provider = 'zeffy'
    and external_payment_id = btrim(p_external_payment_id)
  for update;

  if v_audit_registration_id is not null
    and v_audit_registration_id <> p_registration_id
  then
    return 'payment_already_used';
  end if;

  update public.provider_payment_audit
  set registration_id = p_registration_id
  where provider = 'zeffy'
    and external_payment_id = btrim(p_external_payment_id)
    and registration_id is null;

  update public.conference_registrations
  set
    payment_status = 'paid',
    checkout_correlation_reference = btrim(p_external_payment_id)
  where id = p_registration_id;

  return 'paid';
end;
$$;

revoke all on function public.finalize_zeffy_registration_payment(uuid, text, integer) from public;
grant execute on function public.finalize_zeffy_registration_payment(uuid, text, integer) to service_role;
