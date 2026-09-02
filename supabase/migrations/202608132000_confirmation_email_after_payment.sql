-- Confirmation email is sent after payment succeeds, not at registration.

alter table public.conference_registrations
  add column if not exists confirmation_email_sent_at timestamptz;

comment on column public.conference_registrations.confirmation_email_sent_at is
  'Set only after Resend accepts the post-payment confirmation email. Null means not delivered.';
