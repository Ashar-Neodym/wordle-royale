import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  G0_RETRY_ADAPTER_ENVELOPE_SCHEMA,
  G0_RETRY_COLLECTOR_POLICY_DIGEST,
  G0_RETRY_PROTECTED_BINDINGS_SCHEMA,
  G0RetryEvidenceCollectorError,
  ceilDecimalToFour,
  floorDecimalToFour,
  normalizeRailwayCost,
  collectG0RetryEvidence,
  g0RetryCollectorPolicy,
} from "./g0-retry-evidence-collector-core.mjs";

const t = (second) =>
  `2026-08-03T12:00:${String(second).padStart(2, "0")}.000Z`;
const interval = {
  start: "2026-08-01T00:00:00.000Z",
  end: "2026-09-01T00:00:00.000Z",
};
const absent = (kind) => ({
  id: g0RetryCollectorPolicy.createdIds[kind],
  name: g0RetryCollectorPolicy.createdNames[kind],
  idLookup: "absent",
  nameLookup: "absent",
  pendingDeletion: false,
  tombstone: false,
});
function fixture() {
  const challenge = {
    schemaVersion: "wordle-royale-g0-retry-challenge/v1",
    challengeId: "challenge-aj-001",
    runId: "run-aj-001",
    nonce: "nonce-aj-001",
    issuedAt: t(0),
    expiresAt: t(59),
    collectorKeyId: "collector-aj-001",
    qualification: {
      receiptDigest: "sha256:" + "1".repeat(64),
      targetSha: g0RetryCollectorPolicy.targetSha,
      sourceArtifactDigest: "sha256:" + "2".repeat(64),
      manifestDigest: "sha256:" + "3".repeat(64),
      providerDefaultPolicyDigest: "sha256:" + "4".repeat(64),
    },
    priorConsumedApproval: {
      approvalId: "approval-aj-001",
      artifactDigest: "sha256:" + "5".repeat(64),
    },
    priorAttempt: { artifactDigest: "sha256:" + "6".repeat(64) },
    expectedCreatedResources: Object.fromEntries(
      Object.keys(g0RetryCollectorPolicy.createdIds).map((kind) => [
        kind,
        {
          id: g0RetryCollectorPolicy.createdIds[kind],
          name: g0RetryCollectorPolicy.createdNames[kind],
        },
      ]),
    ),
    expectedPreviewIds: { ...g0RetryCollectorPolicy.preview },
  };
  const protectedBindings = {
    schemaVersion: G0_RETRY_PROTECTED_BINDINGS_SCHEMA,
    challengeId: challenge.challengeId,
    runId: challenge.runId,
    nonce: challenge.nonce,
    collectorKeyId: challenge.collectorKeyId,
    challengeDigest: "sha256:" + "a".repeat(64),
    policyDigest: G0_RETRY_COLLECTOR_POLICY_DIGEST,
    now: t(40),
  };
  const common = (provider, second) => ({
    schemaVersion: G0_RETRY_ADAPTER_ENVELOPE_SCHEMA,
    provider,
    adapterVersion: "synthetic-sanitized/1",
    challengeId: challenge.challengeId,
    runId: challenge.runId,
    nonce: challenge.nonce,
    collectorKeyId: challenge.collectorKeyId,
    challengeDigest: protectedBindings.challengeDigest,
    policyDigest: protectedBindings.policyDigest,
    observedAt: t(second),
    observationMode: "provider_control_plane_read_only",
    providerMutationObserved: false,
    status: "observed",
    blocker: null,
  });
  const vercel = {
    ...common("vercel", 10),
    payload: {
      account: { ...g0RetryCollectorPolicy.accounts.vercel },
      billingInterval: { ...interval },
      chargeQuotes: [
        { currency: "USD", interval: { ...interval }, chargeUsd: "0" },
      ],
      priorCreatedResource: absent("vercelProject"),
      preview: {
        projectId: g0RetryCollectorPolicy.preview.vercelProjectId,
        unchanged: true,
      },
    },
  };
  const railway = {
    ...common("railway", 20),
    payload: {
      account: { ...g0RetryCollectorPolicy.accounts.railway },
      billingInterval: { ...interval },
      costQuotes: [
        {
          currency: "USD",
          interval: { ...interval },
          subtotalUsd: "4.98981",
          taxesUsd: "0.00001",
          feesUsd: "0",
          appliedCreditsUsd: "0.00009",
          unappliedBalanceUsd: "99.99999",
        },
      ],
      priorCreatedResources: {
        railwayProject: absent("railwayProject"),
        railwayEnvironment: absent("railwayEnvironment"),
        railwayService: absent("railwayService"),
        railwayServiceInstance: absent("railwayServiceInstance"),
      },
      preview: {
        projectId: g0RetryCollectorPolicy.preview.railwayProjectId,
        environmentId: g0RetryCollectorPolicy.preview.railwayEnvironmentId,
        serviceId: g0RetryCollectorPolicy.preview.railwayServiceId,
        unchanged: true,
      },
    },
  };
  const supabase = {
    ...common("supabase", 30),
    payload: {
      preview: {
        projectRef: g0RetryCollectorPolicy.preview.postgresqlProjectRef,
        unchanged: true,
      },
    },
  };
  return { challenge, protectedBindings, vercel, railway, supabase };
}
const code = (fn, expected) =>
  assert.throws(
    fn,
    (error) =>
      error instanceof G0RetryEvidenceCollectorError && error.code === expected,
  );

test("decimal normalization is string-only, directional, and conservative", () => {
  assert.equal(ceilDecimalToFour("0"), "0.0000");
  assert.equal(ceilDecimalToFour("12.3"), "12.3000");
  assert.equal(ceilDecimalToFour("1.23450001"), "1.2346");
  assert.equal(ceilDecimalToFour("1.23450000"), "1.2345");
  assert.equal(floorDecimalToFour("1.23459999"), "1.2345");
  assert.equal(
    floorDecimalToFour("999999999999999999999.99999"),
    "999999999999999999999.9999",
  );
  for (const value of [
    -1,
    1,
    NaN,
    null,
    undefined,
    "-1",
    "+1",
    "01.0",
    ".5",
    "1.",
    "1e2",
    "NaN",
    "Infinity",
    " 1.0",
  ])
    code(() => ceilDecimalToFour(value), "DECIMAL_FORMAT_INVALID");
});

test("cost chooses greatest complete same-interval all-in quote and excludes unapplied balance", () => {
  const quote = (subtotal, extra = {}) => ({
    currency: "USD",
    interval: { ...interval },
    subtotalUsd: subtotal,
    taxesUsd: "0.00001",
    feesUsd: "0.00001",
    appliedCreditsUsd: "0.00009",
    unappliedBalanceUsd: "1000.99999",
    ...extra,
  });
  const result = normalizeRailwayCost(
    [
      quote("1.00001"),
      quote("2.00001"),
      quote("4.00001", {
        interval: {
          start: "2026-07-01T00:00:00.000Z",
          end: "2026-08-01T00:00:00.000Z",
        },
      }),
    ],
    interval,
  );
  assert.deepEqual(result, {
    currency: "USD",
    subtotalUsd: "2.0001",
    taxesUsd: "0.0001",
    feesUsd: "0.0001",
    creditsUsd: "0.0000",
    allInUsd: "2.0003",
  });
});

test("unknown, null, and omitted cost components fail specifically; cap is strict", () => {
  const base = {
    currency: "USD",
    interval: { ...interval },
    subtotalUsd: "1",
    taxesUsd: "0",
    feesUsd: "0",
    appliedCreditsUsd: "0",
    unappliedBalanceUsd: "0",
  };
  for (const [field, value, expected] of [
    ["subtotalUsd", null, "SUBTOTAL_UNKNOWN"],
    ["taxesUsd", "unknown", "TAXES_UNKNOWN"],
    ["taxesUsd", undefined, "TAXES_UNKNOWN"],
    ["feesUsd", null, "FEES_UNKNOWN"],
    ["feesUsd", undefined, "FEES_UNKNOWN"],
    ["appliedCreditsUsd", undefined, "APPLIED_CREDITS_UNKNOWN"],
  ]) {
    const quote = { ...base };
    if (value === undefined) delete quote[field];
    else quote[field] = value;
    code(() => normalizeRailwayCost([quote], interval), expected);
  }
  code(
    () => normalizeRailwayCost([{ ...base, subtotalUsd: "5.0000" }], interval),
    "COST_CAP_NOT_STRICTLY_BELOW",
  );
  code(
    () => normalizeRailwayCost([{ ...base, taxesUsd: "1e-2" }], interval),
    "DECIMAL_FORMAT_INVALID",
  );
});

test("every Railway quote is complete and canonical before interval selection", () => {
  const matching = {
    currency: "USD",
    interval: { ...interval },
    subtotalUsd: "1",
    taxesUsd: "0",
    feesUsd: "0",
    appliedCreditsUsd: "0",
    unappliedBalanceUsd: "0",
  };
  const nonmatching = {
    ...matching,
    interval: {
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-08-01T00:00:00.000Z",
    },
  };
  for (const [field, value, expected] of [
    ["taxesUsd", null, "TAXES_UNKNOWN"],
    ["feesUsd", "unknown", "FEES_UNKNOWN"],
    ["subtotalUsd", "not-a-decimal", "DECIMAL_FORMAT_INVALID"],
    ["subtotalUsd", "-1", "DECIMAL_FORMAT_INVALID"],
    ["subtotalUsd", "1e2", "DECIMAL_FORMAT_INVALID"],
    ["appliedCreditsUsd", "not-a-decimal", "DECIMAL_FORMAT_INVALID"],
    ["appliedCreditsUsd", "-1", "DECIMAL_FORMAT_INVALID"],
    ["appliedCreditsUsd", "1e2", "DECIMAL_FORMAT_INVALID"],
  ])
    code(
      () =>
        normalizeRailwayCost(
          [{ ...nonmatching, [field]: value }, matching],
          interval,
        ),
      expected,
    );

  assert.deepEqual(normalizeRailwayCost([nonmatching, matching], interval), {
    currency: "USD",
    subtotalUsd: "1.0000",
    taxesUsd: "0.0000",
    feesUsd: "0.0000",
    creditsUsd: "0.0000",
    allInUsd: "1.0000",
  });
});

test("every Vercel quote is complete and canonical before interval selection", () => {
  const input = fixture();
  const matching = input.vercel.payload.chargeQuotes[0];
  const nonmatching = {
    ...matching,
    interval: {
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-08-01T00:00:00.000Z",
    },
  };
  for (const [name, value, expected] of [
    ["omitted", undefined, "OMITTED_FIELD"],
    ["null", null, "VERCEL_CHARGE_UNKNOWN"],
    ["unknown", "unknown", "VERCEL_CHARGE_UNKNOWN"],
    ["malformed", "not-a-decimal", "DECIMAL_FORMAT_INVALID"],
    ["exponent", "1e2", "DECIMAL_FORMAT_INVALID"],
    ["negative", "-1", "DECIMAL_FORMAT_INVALID"],
  ]) {
    const quote = { ...nonmatching, chargeUsd: value };
    if (name === "omitted") delete quote.chargeUsd;
    const candidate = fixture();
    candidate.vercel.payload.chargeQuotes = [quote, matching];
    code(() => collectG0RetryEvidence(candidate), expected);
  }

  input.vercel.payload.chargeQuotes = [nonmatching, matching];
  assert.equal(
    collectG0RetryEvidence(input).evidence.accounts.vercel.chargeUsd,
    "0.0000",
  );
});

test("composes exact unsigned retry evidence and deterministic inventory", () => {
  const input = fixture();
  const first = collectG0RetryEvidence(input),
    second = collectG0RetryEvidence(input);
  assert.deepEqual(first, second);
  assert.equal(first.status, "collected_unsigned");
  assert.equal(first.hostedMutationAuthorized, false);
  assert.equal("signature" in first.evidence, false);
  assert.deepEqual(Object.keys(first.evidence), [
    "schemaVersion",
    "collector",
    "collectorKeyId",
    "challengeDigest",
    "challengeId",
    "runId",
    "nonce",
    "observedAt",
    "expiresAt",
    "observationMode",
    "providerMutationObserved",
    "accounts",
    "cost",
    "preview",
    "priorCreatedResources",
  ]);
  assert.equal(first.evidence.observedAt, t(30));
  assert.equal(first.evidence.cost.allInUsd, "4.9900");
  assert.equal(first.evidence.accounts.vercel.chargeUsd, "0.0000");
  assert.deepEqual(Object.keys(first.inventory), [
    "schemaVersion",
    "collector",
    "challengeId",
    "runId",
    "observedAt",
    "accounts",
    "cost",
    "preview",
    "priorCreatedResources",
  ]);
  assert.deepEqual(first.inventory.cost, first.evidence.cost);
});

test("all envelopes and nested payloads are closed and protected bindings cannot self-authorize", () => {
  for (const provider of ["vercel", "railway", "supabase"]) {
    const input = fixture();
    input[provider].unexpected = true;
    code(() => collectG0RetryEvidence(input), "UNKNOWN_FIELD");
  }
  {
    const input = fixture();
    delete input.railway.payload.preview;
    code(() => collectG0RetryEvidence(input), "OMITTED_FIELD");
  }
  for (const field of [
    "challengeId",
    "runId",
    "nonce",
    "collectorKeyId",
    "challengeDigest",
  ]) {
    const input = fixture();
    input.vercel[field] =
      field === "challengeDigest"
        ? "sha256:" + "b".repeat(64)
        : `${input.vercel[field]}x`;
    code(() => collectG0RetryEvidence(input), "ADAPTER_BINDING_MISMATCH");
  }
  {
    const input = fixture();
    input.protectedBindings.challengeId = "attacker-choice";
    code(() => collectG0RetryEvidence(input), "PROTECTED_CHALLENGE_MISMATCH");
  }
  {
    const input = fixture();
    input.supabase.observedAt = t(59);
    code(() => collectG0RetryEvidence(input), "ADAPTER_TIME_OUTSIDE_WINDOW");
  }
  {
    const input = fixture();
    input.railway.providerMutationObserved = true;
    code(() => collectG0RetryEvidence(input), "PROVIDER_MUTATION_OBSERVED");
  }
  {
    const input = fixture();
    input.vercel.observationMode = "read_write";
    code(() => collectG0RetryEvidence(input), "NON_READ_ONLY_OBSERVATION");
  }
});

test("exact resources and previews must be absent/preserved", () => {
  for (const [mutate, expected] of [
    [
      (x) => {
        x.vercel.payload.priorCreatedResource.idLookup = "present";
      },
      "PRIOR_RESOURCE_ID_NOT_ABSENT",
    ],
    [
      (x) => {
        x.railway.payload.priorCreatedResources.railwayProject.nameLookup =
          "present";
      },
      "PRIOR_RESOURCE_NAME_NOT_ABSENT",
    ],
    [
      (x) => {
        x.railway.payload.priorCreatedResources.railwayService.pendingDeletion = true;
      },
      "PENDING_DELETION_REMAINS",
    ],
    [
      (x) => {
        x.railway.payload.priorCreatedResources.railwayProject.tombstone = true;
      },
      "TOMBSTONE_ABSENCE_UNPROVEN",
    ],
    [
      (x) => {
        x.supabase.payload.preview.projectRef += "x";
      },
      "PREVIEW_IDENTITY_DRIFT",
    ],
    [
      (x) => {
        x.vercel.payload.preview.unchanged = false;
      },
      "PREVIEW_PRESERVATION_UNPROVEN",
    ],
  ]) {
    const input = fixture();
    mutate(input);
    code(() => collectG0RetryEvidence(input), expected);
  }
});

test("current live facts produce an authority-free blocked result", () => {
  const input = fixture();
  for (const [provider, blocker] of [
    ["vercel", "VERCEL_BILLING_COMPLETENESS_UNAVAILABLE"],
    ["railway", "RAILWAY_TAX_OR_FEE_UNKNOWN"],
    ["supabase", "SUPABASE_AUTH_UNAVAILABLE"],
  ])
    input[provider] = {
      ...input[provider],
      status: "blocked",
      blocker: { code: blocker },
      payload: null,
    };
  const result = collectG0RetryEvidence(input);
  assert.deepEqual(
    result.blockers.map(({ provider, code }) => [provider, code]),
    [
      ["vercel", "VERCEL_BILLING_COMPLETENESS_UNAVAILABLE"],
      ["railway", "RAILWAY_TAX_OR_FEE_UNKNOWN"],
      ["supabase", "SUPABASE_AUTH_UNAVAILABLE"],
    ],
  );
  assert.equal(result.status, "blocked");
  assert.equal(result.hostedMutationAuthorized, false);
  assert.equal("evidence" in result, false);
});

test("blocked claims are provider-specific and cannot smuggle payloads", () => {
  {
    const input = fixture();
    input.vercel = {
      ...input.vercel,
      status: "blocked",
      blocker: { code: "SUPABASE_AUTH_UNAVAILABLE" },
      payload: null,
    };
    code(() => collectG0RetryEvidence(input), "INVALID_BLOCKER");
  }
  {
    const input = fixture();
    input.supabase = {
      ...input.supabase,
      status: "blocked",
      blocker: { code: "SUPABASE_AUTH_UNAVAILABLE" },
    };
    code(
      () => collectG0RetryEvidence(input),
      "BLOCKED_ADAPTER_PAYLOAD_FORBIDDEN",
    );
  }
});

test("semantic core has no imports, ambient clock/env, I/O, subprocess, network, or signing", async () => {
  const source = await readFile(
    new URL("./g0-retry-evidence-collector-core.mjs", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    /^\s*import\s/mu,
    /node:/u,
    /Date\.now/u,
    /process\./u,
    /fetch\s*\(/u,
    /XMLHttpRequest/u,
    /child_process/u,
    /spawn/u,
    /execFile/u,
    /readFile/u,
    /writeFile/u,
    /privateKey/u,
    /createSign/u,
    /\bsign\s*\(/u,
  ])
    assert.doesNotMatch(source, forbidden);
});
