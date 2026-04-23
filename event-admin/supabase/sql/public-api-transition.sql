-- Public API transition notes.
-- After deploying public-api and verifying registration submit/search through
-- Edge Functions, remove anonymous direct write access to registrations.

-- Keep public event reads restricted to visible events.
drop policy if exists "public_read_visible_events" on public.events;
create policy "public_read_visible_events"
on public.events
for select
to anon, authenticated
using (
  coalesce((registration_config -> 'platform' ->> 'isPublished')::boolean, true) = true
  and coalesce((registration_config -> 'platform' ->> 'visibleOnPlatform')::boolean, true) = true
  and nullif(registration_config -> 'platform' ->> 'deletedAt', '') is null
);

-- Once public-api is live, disable anonymous inserts into registrations.
-- The Edge Function uses service role and performs the business validation.
drop policy if exists "public_submit_paid_registrations" on public.registrations;
drop policy if exists "write_registrations" on public.registrations;
drop policy if exists "public_can_insert_registrations" on public.registrations;

-- Remove legacy anonymous/public update policies. Public users should not mutate
-- registration rows directly after public-api owns submit/query workflows.
drop policy if exists "public_can_update_registrations" on public.registrations;

-- Optional: keep read policy only for lookup scenarios while public-api search
-- is rolling out. Remove this after all frontends use public-api search.
drop policy if exists "registrations_can-read" on public.registrations;
drop policy if exists "public_read_paid_review_results" on public.registrations;
create policy "public_read_paid_review_results"
on public.registrations
for select
to anon, authenticated
using (
  payment_status = 'paid'
  and status in ('pending_review', 'approved', 'rejected')
);
