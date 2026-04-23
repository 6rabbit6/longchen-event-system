-- Event business system RLS / policy draft.
-- Apply after reviewing table names and existing policies in Supabase.
-- This file keeps the same rule boundary as the Edge Function:
-- 1. Admin-only mutations for events and reviews.
-- 2. Public reads only for visible, published, non-deleted events.
-- 3. DB-level guard: events.id cannot change after registrations exist.

create table if not exists public.admin_users (
  email text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.admin_users (email, enabled)
values ('417077425@qq.com', true)
on conflict (email) do update set enabled = excluded.enabled;

create or replace function public.is_event_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and enabled = true
  );
$$;

create or replace function public.prevent_event_id_change_with_registrations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    and exists (select 1 from public.registrations where event_id = old.id limit 1)
  then
    raise exception '该赛事已有报名记录，禁止修改 eventId，避免历史数据错乱'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_event_id_change_with_registrations on public.events;
create trigger trg_prevent_event_id_change_with_registrations
before update of id on public.events
for each row
execute function public.prevent_event_id_change_with_registrations();

alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.organizations enable row level security;

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

drop policy if exists "admins_manage_events" on public.events;
create policy "admins_manage_events"
on public.events
for all
to authenticated
using (public.is_event_admin())
with check (public.is_event_admin());

drop policy if exists "admins_manage_registrations" on public.registrations;
create policy "admins_manage_registrations"
on public.registrations
for all
to authenticated
using (public.is_event_admin())
with check (public.is_event_admin());

-- Transitional policy for the older browser registration submission flow.
-- public-api now owns registration submit/search; keep this only until all
-- deployed frontends have switched and then apply public-api-transition.sql.
drop policy if exists "public_submit_paid_registrations" on public.registrations;
create policy "public_submit_paid_registrations"
on public.registrations
for insert
to anon, authenticated
with check (
  status = 'pending_review'
  and payment_status = 'paid'
  and event_id is not null
);

drop policy if exists "public_read_paid_review_results" on public.registrations;
create policy "public_read_paid_review_results"
on public.registrations
for select
to anon, authenticated
using (
  payment_status = 'paid'
  and status in ('pending_review', 'approved', 'rejected')
);

drop policy if exists "public_read_enabled_organizations" on public.organizations;
create policy "public_read_enabled_organizations"
on public.organizations
for select
to anon, authenticated
using (coalesce(enabled, true) = true);

drop policy if exists "admins_manage_organizations" on public.organizations;
create policy "admins_manage_organizations"
on public.organizations
for all
to authenticated
using (public.is_event_admin())
with check (public.is_event_admin());
