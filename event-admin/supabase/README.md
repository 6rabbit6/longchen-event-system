# Supabase API Deployment Notes

This folder contains the first server-side boundary for the event business system.

## Edge Functions

- `admin-api`
  - Local source: `supabase/functions/admin-api/index.ts`
  - Used by: Event Admin
  - Owns: event mutations, eventId checks, review, bulk review, approved export data
- `public-api`
  - Local source: `supabase/functions/public-api/index.ts`
  - Used by: Event Platform V1, Registration System, future WeChat Mini Program
  - Owns: public event reads, registration submit, registration lookup, insurance file upload

## Required secrets

- Required secrets:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_ANON_KEY`, required by `admin-api` for Auth user validation
  - `ADMIN_EMAILS`, comma-separated, for example `417077425@qq.com`, required by `admin-api`
  - `REGISTRATION_FILES_BUCKET`, optional, default `registration-files`
  - `MAX_INSURANCE_FILE_BYTES`, optional, default `5242880`

## Storage bucket

Create a Supabase Storage bucket:

- Bucket name: `registration-files`
- Recommended mode for current V1: public bucket
- Used for: insurance file URLs stored in `registrations.insurance_file_url`

If the bucket is private later, replace the public URL return in `public-api`
with signed URL generation.

Deploy example:

```bash
supabase secrets set \
  SUPABASE_URL=https://vrismtdascvwxiyepxed.supabase.co \
  SUPABASE_ANON_KEY=sb_publishable_xxx \
  SUPABASE_SERVICE_ROLE_KEY=xxx \
  ADMIN_EMAILS=417077425@qq.com \
  REGISTRATION_FILES_BUCKET=registration-files

supabase functions deploy admin-api
supabase functions deploy public-api
```

## SQL / RLS

1. Review and apply `supabase/sql/rls-policies.sql`.
2. Deploy and validate `admin-api` and `public-api`.
3. After public registration submit/search are verified, apply
   `supabase/sql/public-api-transition.sql`.

The SQL includes:

- `admin_users` whitelist table.
- `is_event_admin()` helper.
- A database trigger that prevents changing `events.id` after registrations exist.
- Public event read policy for visible/published/non-deleted events.
- Admin-only event and registration mutation policies.
- Transitional public registration insert/query policies for the current browser submission flow.

Next recommended step: move public registration submit and lookup to Edge Functions, then remove the broad transitional anonymous registration policies.

`public-api` now covers public event listing, event detail, registration submit,
and registration lookup. After deployment, apply `supabase/sql/public-api-transition.sql`
to remove anonymous registration insert access.

## Deployment order

1. Create / verify tables and columns.
2. Create public Storage bucket `registration-files`.
3. Set function secrets.
4. Deploy `admin-api`.
5. Deploy `public-api`.
6. Apply `rls-policies.sql`.
7. Run browser smoke tests.
8. Apply `public-api-transition.sql` only after submit/search tests pass.

## Smoke-test checklist

- Platform page loads visible events through `public-api listEvents`.
- Registration page loads one event through `public-api getEventDetail`.
- Registration submit succeeds through `public-api submitRegistration`.
- Insurance file upload succeeds through `public-api uploadInsuranceFile`.
- Lookup succeeds through `public-api searchRegistrations`.
- Event Admin login works through Supabase Auth.
- Event Admin save/publish/archive/review actions work through `admin-api`.
- Event with registrations cannot change `eventId`.

If any public registration test fails before transition SQL is applied, leave
the transitional anonymous policy in place while fixing the function. After the
transition SQL is applied, rollback means temporarily restoring the old
`public_submit_paid_registrations` policy from `rls-policies.sql`.
