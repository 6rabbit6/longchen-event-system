# Transition Plan: Close Anonymous Registration Writes

## Goal

Move the public registration flow from anonymous browser writes to
`public-api submitRegistration`.

## Preconditions

Only execute `public-api-transition.sql` after all checks pass:

- `public-api listEvents` returns visible events.
- `public-api getEventDetail` handles valid and invalid event IDs.
- `public-api uploadInsuranceFile` uploads insurance files and returns a URL.
- `public-api submitRegistration` creates paid `pending_review` registrations.
- `public-api searchRegistrations` returns lookup results.
- Event Admin can review registrations created through `public-api`.

## Transition SQL

Run:

```sql
-- Supabase SQL editor
\i supabase/sql/public-api-transition.sql
```

Or paste the file contents into Supabase SQL editor.

## Impact

After transition:

- Anonymous clients can no longer insert directly into `registrations`.
- Registration submit must go through `public-api`.
- Lookup can temporarily keep a read policy, but all current web code already
  prefers `public-api searchRegistrations`.

## Rollback

If production submit fails:

1. Restore `public_submit_paid_registrations` from `rls-policies.sql`.
2. Redeploy or fix `public-api`.
3. Run the submit and lookup smoke tests again.
4. Reapply `public-api-transition.sql`.
