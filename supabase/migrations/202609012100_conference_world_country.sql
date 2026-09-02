-- Country-list scope for the registration form: africa | all.

alter table public.conferences
  add column if not exists world_country text;

update public.conferences
set world_country = 'africa'
where slug = 'ghana-2027'
  and (world_country is null or world_country not in ('africa', 'all'));

update public.conferences
set world_country = 'all'
where world_country is null
  or world_country not in ('africa', 'all');

alter table public.conferences
  alter column world_country set default 'all';

alter table public.conferences
  alter column world_country set not null;

alter table public.conferences
  drop constraint if exists conferences_world_country_check;

alter table public.conferences
  add constraint conferences_world_country_check
  check (world_country in ('africa', 'all'));

comment on column public.conferences.world_country is
  'Registration country catalog: africa = African countries, all = full ISO list.';
