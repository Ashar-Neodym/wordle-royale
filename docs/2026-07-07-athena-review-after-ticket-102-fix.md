# Athena review after Ticket 102 — Wave N QA blocker fix

Date: 2026-07-07
Owner: Athena
Scope: Verify Jasmine Ticket 102 result, fix the blocker, and prepare PR #4 for QA re-check.

## Jasmine result

Ticket 102 returned:

- Verdict: `FAIL / REQUIRE FIX BEFORE ACTUAL PROVIDER PROVISIONING OR DEPLOYMENT`
- Blocking finding: the Wave N preview runbook/env docs used `/api/v1` API URL examples even though the current API has no `/api/v1` global prefix and current clients append root-level paths to the configured API origin.

The file-mutation verifier warning was real: Jasmine's response file existed in the working tree, but one later patch attempt failed because the patch target was too broad. Athena verified the response file is present and readable.

## Fix applied by Athena

Corrected active preview env/runbook guidance to use API origin values without `/api/v1` and exact current client env names.

Updated:

- `.env.example`
- `.env.local.example`
- `docs/2026-07-06-preview-infrastructure-env-runbook.md`
- `docs/2026-07-03-preview-mvp-auth-account-deployment-boundary.md`

Key corrected shapes:

```text
API_BASE_URL=https://<preview-api-host>
NEXT_PUBLIC_API_URL=https://<preview-api-host>
EXPO_PUBLIC_API_URL=https://<preview-api-host>
```

Explicit guidance now states current API routes are rooted at the API origin and `/api/v1` must not be appended unless a tested global prefix is implemented later.

## Required follow-up

Because Ticket 102 was an independent QA failure, Jasmine should perform a focused re-check after this fix lands and PR #4 CI is green on the updated head.

Do not approve actual provider provisioning/deployment until Jasmine re-checks the updated PR head.

## Remaining known caveats

- No deployment/provider resources/secrets were created.
- Physical Expo Go visual smoke remains deferred.
- Hosted provider behavior remains unvalidated until Ashar explicitly approves provisioning/deployment.
- Preview demo sessions remain non-durable and reset on API restart/redeploy.
