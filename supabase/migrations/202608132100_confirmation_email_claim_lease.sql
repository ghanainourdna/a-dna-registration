-- Separate the confirmation-email claim lease from the sent timestamp.
-- sent_at is set only after Resend accepts the message. A stale claim (10 minutes)
-- can be retried if the process dies between claim and send.

alter table public.conference_registrations
  add column if not exists confirmation_email_claimed_at timestamptz,
  add column if not exists confirmation_email_claim_token uuid;

comment on column public.conference_registrations.confirmation_email_sent_at is
  'Set only after Resend accepts the post-payment confirmation email. Null means not delivered.';

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
