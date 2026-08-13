-- Confirmation email is sent after payment succeeds, not at registration.

alter table public.conference_registrations
  add column if not exists confirmation_email_sent_at timestamptz;

comment on column public.conference_registrations.confirmation_email_sent_at is
  'Set when the post-payment confirmation email is claimed/sent. Null means not yet emailed.';
