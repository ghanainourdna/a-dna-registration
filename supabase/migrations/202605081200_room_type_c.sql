-- Room type B is now double A; former B tier is C. Remap existing rows so amounts stay valid.

update public.conference_registrations
set room_type = 'C'
where needs_housing = true and room_type = 'B';

alter table public.conference_registrations
  drop constraint if exists conference_registrations_room_type_check;

alter table public.conference_registrations
  add constraint conference_registrations_room_type_check
  check (room_type is null or room_type in ('A', 'B', 'C'));
