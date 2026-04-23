# Deployment and Joint Testing Checklist

## 1. Prerequisites

- Supabase project exists.
- Tables exist: `events`, `registrations`, `organizations`.
- `events.registration_config jsonb` exists.
- Storage bucket exists:
  - `registration-files`
  - public for current V1.

## 2. Secrets

Set all required secrets before deploying functions:

```bash
supabase secrets set \
  SUPABASE_URL=https://vrismtdascvwxiyepxed.supabase.co \
  SUPABASE_ANON_KEY=sb_publishable_xxx \
  SUPABASE_SERVICE_ROLE_KEY=xxx \
  ADMIN_EMAILS=417077425@qq.com \
  REGISTRATION_FILES_BUCKET=registration-files \
  MAX_INSURANCE_FILE_BYTES=5242880
```

## 3. Deploy Functions

```bash
supabase functions deploy admin-api
supabase functions deploy public-api
```

Recommended order:

1. Deploy `admin-api`.
2. Deploy `public-api`.
3. Apply `rls-policies.sql`.
4. Run smoke tests.
5. Apply `public-api-transition.sql`.

## 4. Joint Testing Order

1. Platform
   - Open `Event Platform V1/index.html`.
   - Confirm visible events load.
   - Confirm unpublished / hidden / soft-deleted events do not show.
   - Click one event and confirm it opens the Registration System with `eventId`.
   - Use top-left return and confirm `returnUrl` returns to platform.

2. Registration detail
   - Open a valid event URL.
   - Open invalid / missing eventId URL.
   - Open unpublished / hidden / closed event URLs.
   - Confirm each shows a clear state message.

3. Registration submit
   - Submit a valid registration with insurance.
   - Confirm insurance uploads through `public-api uploadInsuranceFile`.
   - Confirm registration saves through `public-api submitRegistration`.
   - Confirm returned status is `pending_review` and payment status is `paid`.

4. Registration validation
   - Try invalid group.
   - Try invalid event item.
   - Try invalid certificate type.
   - Try invalid organization.
   - Try missing insurance when required.
   - Confirm public-api rejects with a clear message.

5. Lookup
   - Query by registration number.
   - Query by phone.
   - Query by certificate number.
   - Query a missing record and confirm empty result state.

6. Admin
   - Log into Event Admin.
   - Create event.
   - Edit event.
   - Try changing `eventId` after a registration exists.
   - Publish / unpublish.
   - Soft delete.
   - Review one registration.
   - Bulk review registrations.
   - Export approved list.

## 5. Rollback

If submit/search fails before transition:

- Keep `public_submit_paid_registrations` and lookup policies in place.
- Fix and redeploy `public-api`.

If submit/search fails after transition:

- Temporarily restore `public_submit_paid_registrations` from `rls-policies.sql`.
- Confirm frontends can submit again.
- Re-test `public-api`, then rerun `public-api-transition.sql`.
