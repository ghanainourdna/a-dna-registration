-- Checkout total is conference registration only; housing_amount remains informational.

update public.conference_registrations
set total_amount = registration_amount
where total_amount <> registration_amount;
