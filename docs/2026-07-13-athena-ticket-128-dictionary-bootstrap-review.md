# Athena Review — Ticket 128 Hosted Dictionary Bootstrap Failure

Date: 2026-07-13
Verdict: Wave R hosted release remains blocked. Schema deployment succeeded, but the hosted database lacks the runtime dictionary data Standard matchmaking requires.

## Confirmed cause

1. Railway pre-deploy runs `pnpm --filter @wordle-royale/api db:migrate:deploy`.
2. The three Prisma migrations create schema only; none inserts `DictionaryRelease` or `DictionaryWord` rows.
3. Successful local matchmaking integration explicitly runs `db:seed:local` after migrations.
4. The hosted preview never ran a data bootstrap, so the matchmaker's `active|draft`, five-letter lookup returns no row and emits `503 dictionary_release_unavailable`.
5. `/readyz` checks required tables, not operational dictionary data, so it correctly reports schema health but overstates matchmaking readiness.

## Why the existing local seed must not be run wholesale

`db:seed:local` writes both the dictionary and six local fixture users/rating profiles. The hosted preview needs only dictionary data. Running the local seed against Supabase would create unnecessary fixture identities and mix local-only records into hosted preview.

Current safe fixture dictionary dry-run:

```text
id: dict_en_5_test_vfixture_001
version: en-5-test-vfixture.001
status: draft
answers: 20
guesses: 40
banned: 3
total words: 63
fixtureOnly: true
productionApproved: false
source policy: hand_curated_safe_fixture_only
validation: passed
```

## Recommended policy

- Permit this validated fixture dictionary in `APP_ENV=preview` only.
- Add an idempotent dictionary-only bootstrap command; it must not create users, profiles, ratings, matches, or lobbies.
- Require an explicit preview confirmation flag before a remote apply.
- Keep source metadata declaring `fixtureOnly=true` and `productionApproved=false`.
- Production selection must not accept an unapproved draft fixture. Preview may accept the exact fixture policy; production should require an active, production-approved release.
- Add dictionary operational readiness so `/readyz` does not report the Standard queue ready when no usable release/answer exists.
- Add a fresh-migration-without-bootstrap failure test, then bootstrap and prove two-user matching succeeds.
- Normalize concurrent missing-dictionary failures to the same safe `503`; investigate the one generic `500` observed by Ticket 128.

## Hosted operation gate

No Supabase data mutation is authorized by this review. After implementation, CI, independent QA, and Ashar approval, Yuna may run only the reviewed dictionary-only bootstrap against hosted preview and rerun Ticket 128.
