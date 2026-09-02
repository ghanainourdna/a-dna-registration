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
-- Keep the row already linked from the immutable audit record when possible. Older
-- deployments allowed duplicates; clear only the duplicate reference so the
-- registration itself and its paid state remain intact for manual reconciliation.
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

-- Lock the registration first so two distinct payments cannot both fund it, then
-- claim the immutable payment audit row in the same transaction.
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
