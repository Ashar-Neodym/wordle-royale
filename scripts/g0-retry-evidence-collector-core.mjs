// Wave AJ-1 is deliberately an import-free semantic module. It accepts only
// already-parsed, duplicate-key-checked, sanitized objects. Byte parsing,
// provider access, clocks, signing, and publication belong to later layers.

export const G0_RETRY_ADAPTER_ENVELOPE_SCHEMA =
  "wordle-royale-g0-retry-adapter-envelope/v1";
export const G0_RETRY_COLLECTOR_POLICY_SCHEMA =
  "wordle-royale-g0-retry-collector-policy/v1";
export const G0_RETRY_PROTECTED_BINDINGS_SCHEMA =
  "wordle-royale-g0-retry-protected-bindings/v1";
export const G0_RETRY_EVIDENCE_SCHEMA =
  "wordle-royale-g0-retry-provider-evidence/v1";
export const G0_RETRY_INVENTORY_SCHEMA = "wordle-provider-inventory/v3";
export const G0_RETRY_COLLECTOR = "wordle-royale/provider-provenance@3";
export const G0_RETRY_TARGET_SHA = "c1a17f98e555cbf2b291c5a87a6f6311cb8881bb";

const CREATED_IDS = Object.freeze({
  vercelProject: "prj_kTyT8PDyNuBsAs3qCPQBvrRTEb1U",
  railwayProject: "9d69f66f-a3a1-4c83-8280-e2ac204292b0",
  railwayEnvironment: "d746a3d5-3c8f-4a76-ad58-62a1b8acc0f0",
  railwayService: "4b24c070-12d2-45b1-83c1-2a101cc75fa8",
  railwayServiceInstance: "6ea19602-5f0d-42f8-ad9a-83ac12533ee1",
});
const CREATED_NAMES = Object.freeze({
  vercelProject: "wordle-royale-production-web",
  railwayProject: "wordle-royale-production",
  railwayEnvironment: "production",
  railwayService: "wordle-royale-production-api",
  railwayServiceInstance: "wordle-royale-production-api",
});
const PREVIEW = Object.freeze({
  vercelProjectId: "prj_2YxPufRTr52AjnQKvKiIunHnnZXl",
  railwayProjectId: "12f01fb0-40a0-483a-9d88-923b4677b4c0",
  railwayEnvironmentId: "25f2e37e-88a6-4587-a875-d8662b684e54",
  railwayServiceId: "c2d7de01-1827-4df3-933c-572615e020a4",
  postgresqlProjectRef: "edixtvmzktafxipifxvi",
});
const ACCOUNTS = Object.freeze({
  vercel: Object.freeze({
    teamId: "team_OeoH1n8WNMnJfgo4otQGevCG",
    teamSlug: "ashar-neodyms-projects",
    plan: "Hobby",
  }),
  railway: Object.freeze({
    workspaceId: "ae263dc6-85f3-4d84-9415-ecdf621f49b6",
    workspaceName: "ashar-neodym's Projects",
    plan: "Hobby",
  }),
});

// Canonical SHA-256 of the fixed policy object below. It is a semantic-policy
// identity, not a trust-bearing signature.
export const G0_RETRY_COLLECTOR_POLICY_DIGEST =
  "sha256:c5777187dd8de9cf272dce287f426af274dc899689fee154330ae08881837683";
export const g0RetryCollectorPolicy = Object.freeze({
  schemaVersion: G0_RETRY_COLLECTOR_POLICY_SCHEMA,
  targetSha: G0_RETRY_TARGET_SHA,
  observationMode: "provider_control_plane_read_only",
  providerMutationObserved: false,
  currency: "USD",
  strictAllInCapUsd: "5.0000",
  createdIds: CREATED_IDS,
  createdNames: CREATED_NAMES,
  preview: PREVIEW,
  accounts: ACCOUNTS,
});

export class G0RetryEvidenceCollectorError extends Error {
  constructor(code, detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "G0RetryEvidenceCollectorError";
    this.code = code;
  }
}
const fail = (condition, code, detail = "") => {
  if (!condition) throw new G0RetryEvidenceCollectorError(code, detail);
};
const same = (actual, expected, code, path = "") =>
  fail(actual === expected, code, path);
const plain = (value, path) => {
  fail(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
    "INVALID_SHAPE",
    path,
  );
  return value;
};
function exact(value, fields, path) {
  plain(value, path);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  fail(
    actual.join("|") === expected.join("|"),
    actual.some((key) => !expected.includes(key))
      ? "UNKNOWN_FIELD"
      : "OMITTED_FIELD",
    path,
  );
}
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
function timestamp(value, path) {
  fail(
    typeof value === "string" &&
      TIMESTAMP.test(value) &&
      new Date(value).toISOString() === value,
    "INVALID_TIMESTAMP",
    path,
  );
  return Date.parse(value);
}
function digest(value, path) {
  fail(typeof value === "string" && DIGEST.test(value), "INVALID_DIGEST", path);
  return value;
}

// Canonical input permits a zero or non-zero-leading integer and an optional
// fractional part. A decimal point must have digits. Signs, exponent notation,
// whitespace, NaN/Infinity, and redundant integer leading zeroes are rejected.
const DECIMAL = /^(0|[1-9]\d*)(?:\.(\d+))?$/u;
function decimalParts(value, path) {
  fail(
    typeof value === "string" && DECIMAL.test(value),
    "DECIMAL_FORMAT_INVALID",
    path,
  );
  const [whole, fraction = ""] = value.split(".");
  return { whole: BigInt(whole), fraction };
}
function normalizeDecimal(value, direction, path) {
  const { whole, fraction } = decimalParts(value, path);
  const firstFour = (fraction + "0000").slice(0, 4);
  let units = whole * 10000n + BigInt(firstFour);
  if (
    direction === "ceil" &&
    fraction.length > 4 &&
    /[1-9]/u.test(fraction.slice(4))
  )
    units += 1n;
  // floor deliberately drops all remaining fractional digits.
  return `${units / 10000n}.${String(units % 10000n).padStart(4, "0")}`;
}
export const ceilDecimalToFour = (value, path = "decimal") =>
  normalizeDecimal(value, "ceil", path);
export const floorDecimalToFour = (value, path = "decimal") =>
  normalizeDecimal(value, "floor", path);
const units = (value) => {
  const [whole, fraction] = value.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction);
};
const fixed = (value) =>
  `${value / 10000n}.${String(value % 10000n).padStart(4, "0")}`;

function interval(value, path) {
  exact(value, ["start", "end"], path);
  const start = timestamp(value.start, `${path}.start`),
    end = timestamp(value.end, `${path}.end`);
  fail(end > start, "INVALID_BILLING_INTERVAL", path);
  return `${value.start}|${value.end}`;
}
function known(value, code, path) {
  if (value === null || value === undefined || value === "unknown")
    throw new G0RetryEvidenceCollectorError(code, path);
  return value;
}

export function normalizeRailwayCost(quotes, expectedInterval) {
  fail(
    Array.isArray(quotes) && quotes.length > 0,
    "RAILWAY_COST_QUOTES_REQUIRED",
  );
  const wanted = interval(expectedInterval, "railway.billingInterval");
  let greatest = null;
  for (let index = 0; index < quotes.length; index += 1) {
    const quote = quotes[index];
    const path = `railway.costQuotes[${index}]`;
    plain(quote, path);
    for (const [field, code] of [
      ["subtotalUsd", "SUBTOTAL_UNKNOWN"],
      ["taxesUsd", "TAXES_UNKNOWN"],
      ["feesUsd", "FEES_UNKNOWN"],
      ["appliedCreditsUsd", "APPLIED_CREDITS_UNKNOWN"],
    ])
      if (!Object.hasOwn(quote, field))
        throw new G0RetryEvidenceCollectorError(code, `${path}.${field}`);
    exact(
      quote,
      [
        "currency",
        "interval",
        "subtotalUsd",
        "taxesUsd",
        "feesUsd",
        "appliedCreditsUsd",
        "unappliedBalanceUsd",
      ],
      path,
    );
    same(quote.currency, "USD", "COST_CURRENCY_INVALID", path);
    const quoteInterval = interval(quote.interval, `${path}.interval`);
    const subtotal = ceilDecimalToFour(
      known(quote.subtotalUsd, "SUBTOTAL_UNKNOWN", path),
      `${path}.subtotalUsd`,
    );
    const taxes = ceilDecimalToFour(
      known(quote.taxesUsd, "TAXES_UNKNOWN", path),
      `${path}.taxesUsd`,
    );
    const fees = ceilDecimalToFour(
      known(quote.feesUsd, "FEES_UNKNOWN", path),
      `${path}.feesUsd`,
    );
    const credits = floorDecimalToFour(
      known(quote.appliedCreditsUsd, "APPLIED_CREDITS_UNKNOWN", path),
      `${path}.appliedCreditsUsd`,
    );
    // Validate but intentionally do not subtract unapplied account balance.
    decimalParts(
      known(quote.unappliedBalanceUsd, "UNAPPLIED_BALANCE_UNKNOWN", path),
      `${path}.unappliedBalanceUsd`,
    );
    const allIn = units(subtotal) + units(taxes) + units(fees) - units(credits);
    fail(allIn >= 0n, "COST_ARITHMETIC_INVALID", path);
    if (quoteInterval !== wanted) continue;
    const candidate = {
      currency: "USD",
      subtotalUsd: subtotal,
      taxesUsd: taxes,
      feesUsd: fees,
      creditsUsd: credits,
      allInUsd: fixed(allIn),
    };
    if (
      greatest === null ||
      units(candidate.allInUsd) > units(greatest.allInUsd)
    )
      greatest = candidate;
  }
  fail(greatest !== null, "NO_SAME_INTERVAL_COST_QUOTE");
  fail(units(greatest.allInUsd) < 50000n, "COST_CAP_NOT_STRICTLY_BELOW");
  return greatest;
}

function normalizeVercelCharge(quotes, expectedInterval) {
  fail(
    Array.isArray(quotes) && quotes.length > 0,
    "VERCEL_CHARGE_QUOTES_REQUIRED",
  );
  const wanted = interval(expectedInterval, "vercel.billingInterval");
  let greatest = null;
  for (let index = 0; index < quotes.length; index += 1) {
    const quote = quotes[index],
      path = `vercel.chargeQuotes[${index}]`;
    exact(quote, ["currency", "interval", "chargeUsd"], path);
    same(quote.currency, "USD", "COST_CURRENCY_INVALID", path);
    const quoteInterval = interval(quote.interval, `${path}.interval`);
    const charge = ceilDecimalToFour(
      known(quote.chargeUsd, "VERCEL_CHARGE_UNKNOWN", path),
      `${path}.chargeUsd`,
    );
    if (quoteInterval !== wanted) continue;
    if (greatest === null || units(charge) > units(greatest)) greatest = charge;
  }
  fail(greatest !== null, "NO_SAME_INTERVAL_CHARGE_QUOTE");
  same(greatest, "0.0000", "VERCEL_CHARGE_NOT_ZERO");
  return greatest;
}

const COMMON = [
  "schemaVersion",
  "provider",
  "adapterVersion",
  "challengeId",
  "runId",
  "nonce",
  "collectorKeyId",
  "challengeDigest",
  "policyDigest",
  "observedAt",
  "observationMode",
  "providerMutationObserved",
  "status",
  "blocker",
  "payload",
];
const BLOCKERS = Object.freeze({
  vercel: "VERCEL_BILLING_COMPLETENESS_UNAVAILABLE",
  railway: "RAILWAY_TAX_OR_FEE_UNKNOWN",
  supabase: "SUPABASE_AUTH_UNAVAILABLE",
});
function envelope(raw, provider, challenge, bindings) {
  const path = `adapters.${provider}`;
  exact(raw, COMMON, path);
  same(
    raw.schemaVersion,
    G0_RETRY_ADAPTER_ENVELOPE_SCHEMA,
    "UNSUPPORTED_ADAPTER_ENVELOPE",
    path,
  );
  same(raw.provider, provider, "ADAPTER_PROVIDER_MISMATCH", path);
  fail(
    typeof raw.adapterVersion === "string" &&
      raw.adapterVersion.length > 0 &&
      raw.adapterVersion.length <= 200 &&
      !/[\r\n\0]/u.test(raw.adapterVersion),
    "INVALID_ADAPTER_VERSION",
    path,
  );
  for (const field of ["challengeId", "runId", "nonce", "collectorKeyId"])
    same(
      raw[field],
      challenge[field],
      "ADAPTER_BINDING_MISMATCH",
      `${path}.${field}`,
    );
  same(
    digest(raw.challengeDigest, `${path}.challengeDigest`),
    bindings.challengeDigest,
    "ADAPTER_BINDING_MISMATCH",
    `${path}.challengeDigest`,
  );
  same(
    raw.policyDigest,
    G0_RETRY_COLLECTOR_POLICY_DIGEST,
    "ADAPTER_POLICY_MISMATCH",
    path,
  );
  same(
    raw.observationMode,
    g0RetryCollectorPolicy.observationMode,
    "NON_READ_ONLY_OBSERVATION",
    path,
  );
  same(raw.providerMutationObserved, false, "PROVIDER_MUTATION_OBSERVED", path);
  const observed = timestamp(raw.observedAt, `${path}.observedAt`);
  fail(
    observed >= bindings.issued &&
      observed < bindings.expires &&
      observed <= bindings.now,
    "ADAPTER_TIME_OUTSIDE_WINDOW",
    path,
  );
  fail(
    raw.status === "observed" || raw.status === "blocked",
    "INVALID_ADAPTER_STATUS",
    path,
  );
  if (raw.status === "blocked") {
    exact(raw.blocker, ["code"], `${path}.blocker`);
    same(raw.blocker.code, BLOCKERS[provider], "INVALID_BLOCKER", path);
    same(raw.payload, null, "BLOCKED_ADAPTER_PAYLOAD_FORBIDDEN", path);
    return {
      blocked: { provider, code: raw.blocker.code, observedAt: raw.observedAt },
      observed,
    };
  }
  same(raw.blocker, null, "OBSERVED_ADAPTER_BLOCKER_FORBIDDEN", path);
  plain(raw.payload, `${path}.payload`);
  return { payload: raw.payload, observed };
}
function absent(value, kind, path) {
  exact(
    value,
    ["id", "name", "idLookup", "nameLookup", "pendingDeletion", "tombstone"],
    path,
  );
  same(value.id, CREATED_IDS[kind], "OBSERVED_RESOURCE_ID_MISMATCH", path);
  same(
    value.name,
    CREATED_NAMES[kind],
    "OBSERVED_RESOURCE_NAME_MISMATCH",
    path,
  );
  same(value.idLookup, "absent", "PRIOR_RESOURCE_ID_NOT_ABSENT", path);
  same(value.nameLookup, "absent", "PRIOR_RESOURCE_NAME_NOT_ABSENT", path);
  same(value.pendingDeletion, false, "PENDING_DELETION_REMAINS", path);
  same(value.tombstone, false, "TOMBSTONE_ABSENCE_UNPROVEN", path);
  return structuredClone(value);
}
function validateBindings(challenge, bindings) {
  exact(
    bindings,
    [
      "schemaVersion",
      "challengeId",
      "runId",
      "nonce",
      "collectorKeyId",
      "challengeDigest",
      "policyDigest",
      "now",
    ],
    "protectedBindings",
  );
  same(
    bindings.schemaVersion,
    G0_RETRY_PROTECTED_BINDINGS_SCHEMA,
    "UNSUPPORTED_PROTECTED_BINDINGS",
  );
  for (const field of ["challengeId", "runId", "nonce", "collectorKeyId"])
    same(
      bindings[field],
      challenge[field],
      "PROTECTED_CHALLENGE_MISMATCH",
      field,
    );
  digest(bindings.challengeDigest, "protectedBindings.challengeDigest");
  same(
    bindings.policyDigest,
    G0_RETRY_COLLECTOR_POLICY_DIGEST,
    "PROTECTED_POLICY_MISMATCH",
  );
  const issued = timestamp(challenge.issuedAt, "challenge.issuedAt"),
    expires = timestamp(challenge.expiresAt, "challenge.expiresAt"),
    now = timestamp(bindings.now, "protectedBindings.now");
  fail(
    expires > issued && now >= issued && now < expires,
    "INVALID_CHALLENGE_WINDOW",
  );
  return { ...bindings, issued, expires, now };
}
function validateChallenge(challenge) {
  exact(
    challenge,
    [
      "schemaVersion",
      "challengeId",
      "runId",
      "nonce",
      "issuedAt",
      "expiresAt",
      "collectorKeyId",
      "qualification",
      "priorConsumedApproval",
      "priorAttempt",
      "expectedCreatedResources",
      "expectedPreviewIds",
    ],
    "challenge",
  );
  same(
    challenge.schemaVersion,
    "wordle-royale-g0-retry-challenge/v1",
    "UNSUPPORTED_CHALLENGE",
  );
  for (const field of ["challengeId", "runId", "nonce", "collectorKeyId"])
    fail(
      typeof challenge[field] === "string" &&
        challenge[field].length >= 3 &&
        challenge[field].length <= 128,
      "INVALID_ID",
      `challenge.${field}`,
    );
  exact(
    challenge.qualification,
    [
      "receiptDigest",
      "targetSha",
      "sourceArtifactDigest",
      "manifestDigest",
      "providerDefaultPolicyDigest",
    ],
    "challenge.qualification",
  );
  same(
    challenge.qualification.targetSha,
    G0_RETRY_TARGET_SHA,
    "TARGET_SHA_MISMATCH",
  );
  for (const field of [
    "receiptDigest",
    "sourceArtifactDigest",
    "manifestDigest",
    "providerDefaultPolicyDigest",
  ])
    digest(challenge.qualification[field], `challenge.qualification.${field}`);
  exact(
    challenge.priorConsumedApproval,
    ["approvalId", "artifactDigest"],
    "challenge.priorConsumedApproval",
  );
  fail(
    typeof challenge.priorConsumedApproval.approvalId === "string",
    "INVALID_ID",
    "challenge.priorConsumedApproval.approvalId",
  );
  digest(
    challenge.priorConsumedApproval.artifactDigest,
    "challenge.priorConsumedApproval.artifactDigest",
  );
  exact(challenge.priorAttempt, ["artifactDigest"], "challenge.priorAttempt");
  digest(
    challenge.priorAttempt.artifactDigest,
    "challenge.priorAttempt.artifactDigest",
  );
  exact(
    challenge.expectedCreatedResources,
    Object.keys(CREATED_IDS),
    "challenge.expectedCreatedResources",
  );
  for (const kind of Object.keys(CREATED_IDS)) {
    exact(
      challenge.expectedCreatedResources[kind],
      ["id", "name"],
      `challenge.expectedCreatedResources.${kind}`,
    );
    same(
      challenge.expectedCreatedResources[kind].id,
      CREATED_IDS[kind],
      "CHALLENGE_RESOURCE_MISMATCH",
      kind,
    );
    same(
      challenge.expectedCreatedResources[kind].name,
      CREATED_NAMES[kind],
      "CHALLENGE_RESOURCE_MISMATCH",
      kind,
    );
  }
  exact(
    challenge.expectedPreviewIds,
    Object.keys(PREVIEW),
    "challenge.expectedPreviewIds",
  );
  for (const [key, value] of Object.entries(PREVIEW))
    same(
      challenge.expectedPreviewIds[key],
      value,
      "PREVIEW_IDENTITY_DRIFT",
      key,
    );
}

function validateVercelPayload(vp) {
  exact(
    vp,
    [
      "account",
      "billingInterval",
      "chargeQuotes",
      "priorCreatedResource",
      "preview",
    ],
    "adapters.vercel.payload",
  );
  exact(vp.account, ["teamId", "teamSlug", "plan"], "vercel.account");
  for (const [key, value] of Object.entries(ACCOUNTS.vercel))
    same(vp.account[key], value, "VERCEL_ACCOUNT_OR_PLAN_MISMATCH", key);
  exact(vp.preview, ["projectId", "unchanged"], "vercel.preview");
  same(vp.preview.projectId, PREVIEW.vercelProjectId, "PREVIEW_IDENTITY_DRIFT");
  same(vp.preview.unchanged, true, "PREVIEW_PRESERVATION_UNPROVEN");
  return {
    charge: normalizeVercelCharge(vp.chargeQuotes, vp.billingInterval),
    resource: absent(
      vp.priorCreatedResource,
      "vercelProject",
      "vercel.priorCreatedResource",
    ),
  };
}
function validateRailwayPayload(rp) {
  exact(
    rp,
    [
      "account",
      "billingInterval",
      "costQuotes",
      "priorCreatedResources",
      "preview",
    ],
    "adapters.railway.payload",
  );
  exact(
    rp.account,
    ["workspaceId", "workspaceName", "plan"],
    "railway.account",
  );
  for (const [key, value] of Object.entries(ACCOUNTS.railway))
    same(rp.account[key], value, "RAILWAY_ACCOUNT_OR_PLAN_MISMATCH", key);
  exact(
    rp.priorCreatedResources,
    [
      "railwayProject",
      "railwayEnvironment",
      "railwayService",
      "railwayServiceInstance",
    ],
    "railway.priorCreatedResources",
  );
  const resources = {};
  for (const kind of Object.keys(rp.priorCreatedResources))
    resources[kind] = absent(
      rp.priorCreatedResources[kind],
      kind,
      `railway.priorCreatedResources.${kind}`,
    );
  exact(
    rp.preview,
    ["projectId", "environmentId", "serviceId", "unchanged"],
    "railway.preview",
  );
  for (const [field, key] of [
    ["projectId", "railwayProjectId"],
    ["environmentId", "railwayEnvironmentId"],
    ["serviceId", "railwayServiceId"],
  ])
    same(rp.preview[field], PREVIEW[key], "PREVIEW_IDENTITY_DRIFT", field);
  same(rp.preview.unchanged, true, "PREVIEW_PRESERVATION_UNPROVEN");
  return {
    cost: normalizeRailwayCost(rp.costQuotes, rp.billingInterval),
    resources,
  };
}
function validateSupabasePayload(sp) {
  exact(sp, ["preview"], "adapters.supabase.payload");
  exact(sp.preview, ["projectRef", "unchanged"], "supabase.preview");
  same(
    sp.preview.projectRef,
    PREVIEW.postgresqlProjectRef,
    "PREVIEW_IDENTITY_DRIFT",
  );
  same(sp.preview.unchanged, true, "PREVIEW_PRESERVATION_UNPROVEN");
}

/** Compose unsigned verifier-ready evidence and deterministic inventory. */
export function collectG0RetryEvidence({
  challenge,
  protectedBindings,
  vercel,
  railway,
  supabase,
}) {
  validateChallenge(challenge);
  const bindings = validateBindings(challenge, protectedBindings);
  const observations = {
    vercel: envelope(vercel, "vercel", challenge, bindings),
    railway: envelope(railway, "railway", challenge, bindings),
    supabase: envelope(supabase, "supabase", challenge, bindings),
  };
  // Even a different provider's blocker cannot mask malformed accepted data.
  const normalized = {};
  if (!observations.vercel.blocked)
    normalized.vercel = validateVercelPayload(observations.vercel.payload);
  if (!observations.railway.blocked)
    normalized.railway = validateRailwayPayload(observations.railway.payload);
  if (!observations.supabase.blocked)
    validateSupabasePayload(observations.supabase.payload);
  const blockers = Object.values(observations)
    .filter((entry) => entry.blocked)
    .map((entry) => entry.blocked);
  if (blockers.length > 0)
    return {
      status: "blocked",
      targetSha: G0_RETRY_TARGET_SHA,
      hostedMutationAuthorized: false,
      blockers,
    };
  const resources = {
    vercelProject: normalized.vercel.resource,
    ...normalized.railway.resources,
  };
  const cost = normalized.railway.cost;
  const observedAt = new Date(
    Math.max(...Object.values(observations).map((entry) => entry.observed)),
  ).toISOString();
  const evidence = {
    schemaVersion: G0_RETRY_EVIDENCE_SCHEMA,
    collector: G0_RETRY_COLLECTOR,
    collectorKeyId: challenge.collectorKeyId,
    challengeDigest: bindings.challengeDigest,
    challengeId: challenge.challengeId,
    runId: challenge.runId,
    nonce: challenge.nonce,
    observedAt,
    expiresAt: challenge.expiresAt,
    observationMode: g0RetryCollectorPolicy.observationMode,
    providerMutationObserved: false,
    accounts: {
      vercel: { ...ACCOUNTS.vercel, chargeUsd: normalized.vercel.charge },
      railway: { ...ACCOUNTS.railway },
    },
    cost,
    preview: { ...PREVIEW, unchanged: true },
    priorCreatedResources: resources,
  };
  const inventory = {
    schemaVersion: G0_RETRY_INVENTORY_SCHEMA,
    collector: G0_RETRY_COLLECTOR,
    challengeId: challenge.challengeId,
    runId: challenge.runId,
    observedAt,
    accounts: structuredClone(evidence.accounts),
    cost: structuredClone(cost),
    preview: structuredClone(evidence.preview),
    priorCreatedResources: structuredClone(resources),
  };
  return {
    status: "collected_unsigned",
    targetSha: G0_RETRY_TARGET_SHA,
    hostedMutationAuthorized: false,
    evidence,
    inventory,
  };
}
