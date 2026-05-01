-- Countries reference table: readable by everyone (registration form catalog).
-- Re-run safe: aligns grants + single public SELECT policy with RLS enabled.

grant usage on schema public to anon, authenticated;

grant select on table public.countries to anon, authenticated, service_role;
grant select on table public.countries to public;

alter table public.countries enable row level security;

drop policy if exists countries_select_all on public.countries;
drop policy if exists countries_select_public on public.countries;

create policy countries_select_public
  on public.countries
  for select
  to public
  using (true);
