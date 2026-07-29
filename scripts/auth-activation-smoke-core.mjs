import { createHash } from 'node:crypto';
import { canonicalJson, receiptFor, verifyPreflightReceipt, ActivationFailure } from './auth-activation-preflight-core.mjs';

const SHA = /^[a-f0-9]{40,64}$/u;
const RECEIPT = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const APPROVAL_KEYS = ['schemaVersion','approvalId','runId','preflightReceipt','artifactSha','provider','deployments','origins','registrationMode','accountFingerprint','approvedAt','expiresAt'];
const SECRET_KEYS = /(email|password|cookieValue|token|authorization|body|response)/iu;
const fail = (ok, code) => { if (!ok) throw new ActivationFailure(code); };
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys, code) => fail(object(v) && Object.keys(v).sort().join('|') === [...keys].sort().join('|'), code);
function safeEvidence(v, path = '') {
  if (Array.isArray(v)) return v.forEach((x, i) => safeEvidence(x, `${path}.${i}`));
  if (object(v)) return Object.entries(v).forEach(([k, x]) => { fail(!SECRET_KEYS.test(k), `evidence_forbidden_field:${path}.${k}`); safeEvidence(x, `${path}.${k}`); });
  if (typeof v === 'string') fail(v.length <= 256 && !/@|set-cookie|bearer\s|__Host-wr_session=/iu.test(v), `evidence_forbidden_value:${path}`);
}
function canonicalOrigin(raw, label) { let u; try { u = new URL(raw); } catch { throw new ActivationFailure(`${label}_origin_invalid`); } fail(raw === u.origin && u.protocol === 'https:' && !u.username && !u.password, `${label}_origin_invalid`); }
export function accountFingerprint(runId, { email, handle, displayName }) { return createHash('sha256').update(`auth-smoke-account-v2\0${runId}\0${email.trim().toLowerCase()}\0${handle}\0${displayName}`).digest('hex'); }
export function validateApproval(v, preflight, secrets, now = Date.now()) {
  preflight = verifyPreflightReceipt(preflight, now);
  exact(v, APPROVAL_KEYS, 'approval_schema_invalid');
  fail(v.schemaVersion === 1 && ID.test(v.approvalId) && ID.test(v.runId) && RECEIPT.test(v.preflightReceipt) && SHA.test(v.artifactSha), 'approval_identity_invalid');
  fail(v.registrationMode === 'canary', 'approval_registration_mode_invalid');
  exact(v.provider, Object.keys(preflight.evidence.provider), 'approval_provider_schema_invalid');
  exact(v.deployments, Object.keys(preflight.evidence.deployments), 'approval_deployment_schema_invalid');
  exact(v.origins, ['api','web'], 'approval_origin_schema_invalid');
  canonicalOrigin(v.origins.api, 'api'); canonicalOrigin(v.origins.web, 'web');
  fail(v.preflightReceipt === preflight.receipt && v.artifactSha === preflight.evidence.artifactSha && canonicalJson(v.provider) === canonicalJson(preflight.evidence.provider) && canonicalJson(v.deployments) === canonicalJson(preflight.evidence.deployments) && v.origins.api === preflight.evidence.origins.api && v.origins.web === preflight.evidence.origins.web, 'approval_preflight_binding_mismatch');
  fail(v.runId === preflight.evidence.runId, 'approval_run_id_mismatch');
  fail(preflight.evidence.result === 'PASS' && preflight.evidence.activationPhase === 'canary' && preflight.evidence.config.registrationMode === 'canary', 'preflight_not_canary_ready');
  const approved = Date.parse(v.approvedAt), expires = Date.parse(v.expiresAt);
  fail(Number.isFinite(approved) && Number.isFinite(expires) && expires > approved && expires - approved <= 30 * 60_000 && now >= approved - 30_000 && now < expires, 'approval_stale');
  validateSecrets(secrets);
  fail(v.accountFingerprint === accountFingerprint(v.runId, secrets), 'approval_account_binding_mismatch');
  safeEvidence(v); return v;
}
export function validateSecrets(v) {
  exact(v, ['email','password','handle','displayName'], 'secret_input_schema_invalid');
  fail(typeof v.email === 'string' && v.email.length >= 6 && v.email.length <= 254 && v.email.includes('@'), 'secret_input_malformed');
  fail(typeof v.password === 'string' && v.password.length >= 12 && v.password.length <= 256, 'secret_input_malformed');
  fail(typeof v.handle === 'string' && /^[a-z][a-z0-9_]{2,23}$/u.test(v.handle), 'secret_input_malformed');
  fail(typeof v.displayName === 'string' && v.displayName.length >= 2 && v.displayName.length <= 50, 'secret_input_malformed');
  return v;
}
export const SMOKE_RECONCILIATION_SQL = Object.freeze({
  isolation: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
  readOnlyStatus: 'SHOW transaction_read_only',
  snapshot: 'SELECT auth_activation_smoke_reconciliation_v2($1,$2)',
});
const RECONCILIATION_KEYS = ['accountCount','profileCount','credentialCount','consentCount','sessionCount','terminalSessionCount','activeSessionCount','accountIdentityFingerprint','nonTargetSessionCount','nonTargetSessionFingerprint','nonTargetAuthCount','nonTargetAuthFingerprint','registerAttempts','loginAttempts','registerBucketCount','loginBucketCount','blockedBucketCount','lobbyWriteCount','speedWriteCount','ticketWriteCount','matchWriteCount','gameplayWriteCount','mutationWriteCount','ratingWriteCount','eventWriteCount','sharedStateFingerprint','sharedStateUnchanged','catalogFingerprint'];
async function reconciliationRead(reconciliation, binding) {
  fail(reconciliation && typeof reconciliation.withReadOnlyTransaction === 'function', 'reconciliation_adapter_missing');
  let result; let statements = 0;
  await reconciliation.withReadOnlyTransaction(async (query) => {
    await query(SMOKE_RECONCILIATION_SQL.isolation); statements++;
    const status = await query(SMOKE_RECONCILIATION_SQL.readOnlyStatus); statements++;
    fail(status?.transactionReadOnly === 'on', 'reconciliation_transaction_read_only_off');
    result = await query(SMOKE_RECONCILIATION_SQL.snapshot, binding); statements++;
  });
  fail(statements === 3, 'reconciliation_statement_accounting_invalid');
  exact(result, RECONCILIATION_KEYS, 'reconciliation_snapshot_schema_invalid');
  return result;
}

const MAX_RESPONSE_BYTES = 64 * 1024;
const TRANSPORT_RECORD_KEYS = ['method','url','effectiveUrl','origin','redirect','status','contentType','bodyBytes','setCookie','body','elapsedMs','attempts'];
const status = (r, expected, code) => fail(r && r.status === expected, code);
const ERROR_KEYS = ['data','error','requestId'];
function noLeak(r) {
  const text = canonicalJson(r?.body ?? null);
  fail(!/("[^"]*token[^"]*"\s*:|passwordHash|set-cookie|__Host-wr_session=|wr1\.)/iu.test(text), 'response_token_leak');
  fail(r?.contentType === 'application/json' || (r?.status === 204 && r?.contentType === null), 'response_content_type_invalid');
  fail(Number.isSafeInteger(r?.bodyBytes) && r.bodyBytes >= 0 && r.bodyBytes <= MAX_RESPONSE_BYTES, 'response_body_oversized');
  fail(Buffer.byteLength(text) <= MAX_RESPONSE_BYTES, 'response_body_oversized');
  fail(Array.isArray(r?.setCookie) && r.setCookie.every((v) => typeof v === 'string' && v.length <= 4096), 'response_set_cookie_invalid');
}
function exactError(r, statusCode, code, message) {
  status(r, statusCode, `${code}_status_invalid`);
  exact(r.body, ERROR_KEYS, `${code}_envelope_invalid`);
  exact(r.body.error, ['code','message','details'], `${code}_envelope_invalid`);
  fail(r.body.data === null && r.body.error.code === code && r.body.error.message === message && object(r.body.error.details) && Object.keys(r.body.error.details).length === 0 && typeof r.body.requestId === 'string' && r.body.requestId.length <= 128, `${code}_envelope_invalid`);
  fail(r.setCookie.length === 0, `${code}_set_cookie_invalid`);
}
function successEnvelope(r, code, permitsSessionCookie = false) {
  exact(r.body, ERROR_KEYS, `${code}_envelope_invalid`);
  fail(r.body.error === null && object(r.body.data) && typeof r.body.requestId === 'string' && r.body.requestId.length <= 128, `${code}_envelope_invalid`);
  if (!permitsSessionCookie) fail(r.setCookie.length === 0, `${code}_set_cookie_invalid`);
}
function authRequired(r) {
  status(r, 401, 'not_authenticated_status_invalid');
  exact(r.body, ERROR_KEYS, 'not_authenticated_envelope_invalid'); exact(r.body.error, ['code','message','details'], 'not_authenticated_envelope_invalid'); exact(r.body.error.details, ['authMode','appEnv'], 'not_authenticated_envelope_invalid');
  fail(r.body.data === null && r.body.error.code === 'not_authenticated' && r.body.error.message === 'Sign in is required for this action.' && r.body.error.details.authMode === 'session_required' && r.body.error.details.appEnv === 'production' && typeof r.body.requestId === 'string', 'not_authenticated_envelope_invalid');
  fail(r.setCookie.length === 0, 'not_authenticated_set_cookie_invalid');
}
function parseCookie(line, code) {
  fail(typeof line === 'string' && line.length > 0, code);
  const parts = line.split(';').map((v) => v.trim());
  const first = parts.shift(); const separator = first?.indexOf('=') ?? -1;
  fail(separator > 0, code);
  const attributes = new Map();
  for (const part of parts) {
    const i = part.indexOf('='); const name = (i < 0 ? part : part.slice(0, i)).toLowerCase(); const value = i < 0 ? true : part.slice(i + 1);
    fail(['secure','httponly','samesite','path','max-age','expires'].includes(name) && !attributes.has(name), code);
    attributes.set(name, value);
  }
  fail(attributes.size === 6, code);
  return { name: first.slice(0, separator), value: first.slice(separator + 1), attributes };
}
function cookieFrom(r) {
  fail(r.setCookie.length === 1, 'cookie_count_invalid');
  const c = parseCookie(r.setCookie[0], 'cookie_shape_invalid'), a = c.attributes;
  fail(c.name === '__Host-wr_session' && /^wr1\.[A-Za-z0-9_-]{43}$/u.test(c.value) && a.get('secure') === true && a.get('httponly') === true && a.get('samesite') === 'Lax' && a.get('path') === '/' && !a.has('domain') && /^\d+$/u.test(a.get('max-age')) && Number(a.get('max-age')) > 0 && Number.isFinite(Date.parse(a.get('expires'))), 'cookie_policy_invalid');
  return `${c.name}=${c.value}`;
}
function clearingCookie(r) {
  fail(r.body === null && r.contentType === null && r.bodyBytes === 0, 'clear_cookie_response_invalid');
  fail(r.setCookie.length === 1, 'clear_cookie_count_invalid');
  const c = parseCookie(r.setCookie[0], 'clear_cookie_shape_invalid'), a = c.attributes;
  fail(c.name === '__Host-wr_session' && c.value === '' && a.get('secure') === true && a.get('httponly') === true && a.get('samesite') === 'Lax' && a.get('path') === '/' && !a.has('domain') && a.get('max-age') === '0' && Number.isFinite(Date.parse(a.get('expires'))) && Date.parse(a.get('expires')) <= 0, 'clear_cookie_policy_invalid');
}
async function request(transport, approval, method, path, options = {}) {
  fail(['GET','POST'].includes(method), 'unsupported_method');
  const origin = options.origin ?? approval.origins.web;
  const authority = options.authority ?? 'api';
  const url = new URL(path, `${approval.origins[authority]}/`).href;
  const maximumDeadlineMs = method === 'POST' ? 8_000 : 5_000;
  const deadlineMs = Number.isSafeInteger(transport.deadlineCapMs) && transport.deadlineCapMs > 0
    ? Math.min(maximumDeadlineMs, transport.deadlineCapMs) : maximumDeadlineMs;
  let timer;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new ActivationFailure('request_deadline_exceeded')), deadlineMs); });
  let r;
  try { r = await Promise.race([transport.request({ method, url, redirect: 'manual', origin, deadlineMs, retryLimit: 0, ...options }), deadline]); }
  finally { clearTimeout(timer); }
  exact(r, TRANSPORT_RECORD_KEYS, 'transport_record_schema_invalid');
  fail(r.method === method && r.url === url && r.origin === origin && r.redirect === 'manual', 'transport_request_identity_invalid');
  fail(r.attempts === 1, 'transport_retry_detected');
  fail(!(r.status >= 300 && r.status < 400), 'response_redirect');
  fail(r.effectiveUrl === url, 'transport_response_authority_invalid');
  let effective; try { effective = new URL(r.effectiveUrl); } catch { throw new ActivationFailure('transport_response_authority_invalid'); }
  fail(effective.protocol === 'https:' && effective.origin === approval.origins[authority], 'transport_response_authority_invalid');
  noLeak(r); return r;
}
/** Exactly one register dispatch; the injected transport must not retry. */
export async function runAuthActivationSmoke({ approval, preflight, secrets, transport, reconciliation, consumeApproval, now = () => Date.now() }) {
  const evidence = { schemaVersion: 1, result: 'FAIL', runId: typeof approval?.runId === 'string' ? approval.runId : 'invalid', approvalConsumed: false, registerDispatches: 0, retries: 0, statuses: [], sessionsCreated: 0, checks: { identity: false, freshWebIdentity: false, negative: false, cookieAmbiguity: false, enumerationGeneric: false, registration: false, secureHostCookie: false, me: false, logoutReplay: false, reloginRevocation: false, finalZeroActive: false, rankedUnchanged: false, nonTargetSessionsUnchanged: false } };
  let jar = null;
  try {
    validateApproval(approval, preflight, secrets, now());
    fail(transport && typeof transport.request === 'function' && typeof consumeApproval === 'function', 'adapter_missing');
    const before = await reconciliationRead(reconciliation, { runId: approval.runId, accountFingerprint: approval.accountFingerprint });
    fail(before.accountCount === 0 && before.profileCount === 0 && before.credentialCount === 0 && before.consentCount === 0 && before.sessionCount === 0 && before.terminalSessionCount === 0 && before.activeSessionCount === 0, 'baseline_not_clean');
    fail(['registerAttempts','loginAttempts','registerBucketCount','loginBucketCount','blockedBucketCount','lobbyWriteCount','speedWriteCount','ticketWriteCount','matchWriteCount','gameplayWriteCount','mutationWriteCount','ratingWriteCount','eventWriteCount'].every((key) => before[key] === 0) && before.sharedStateUnchanged === true && [before.catalogFingerprint,before.sharedStateFingerprint,before.nonTargetSessionFingerprint,before.nonTargetAuthFingerprint].every((value) => typeof value === 'string' && RECEIPT.test(value)), 'baseline_not_clean');
    let catalogBefore;
    for (const [path, validator] of [['/healthz', (d) => d?.status === 'ok'], ['/readyz', (d) => ['ok','degraded'].includes(d?.status) && d?.revision === approval.deployments.apiRevision && d?.dependencies?.durableAuth?.status === 'ok' && d?.dependencies?.durableAuth?.registrationMode === 'canary'], ['/ranked/modes', (d) => Array.isArray(d?.modes) && d.modes.some((m) => m.id === 'standard_1v1' && m.enabled === true) && d.modes.some((m) => m.id === 'speed_1v1' && m.enabled === true)]]) {
      const r = await request(transport, approval, 'GET', path); status(r, 200, 'identity_recheck_failed'); successEnvelope(r, 'identity'); fail(validator(r.body.data), 'identity_recheck_failed'); evidence.statuses.push(r.status);
      if (path === '/ranked/modes') catalogBefore = canonicalJson(r.body.data);
    }
    evidence.checks.identity = true;
    const badOrigin = await request(transport, approval, 'POST', '/auth/login', { origin: 'https://invalid.example', json: { email: secrets.email, password: secrets.password } });
    exactError(badOrigin, 403, 'unsafe_request_origin', 'Request origin is not allowed.'); evidence.statuses.push(badOrigin.status);
    const webIdentity = await request(transport, approval, 'GET', '/.well-known/wordle-identity', { authority: 'web' });
    status(webIdentity, 200, 'web_identity_recheck_failed');
    exact(webIdentity.body, ['revision','appEnvironment','mode','registrationMode'], 'web_identity_recheck_failed');
    fail(webIdentity.body.revision === approval.deployments.webRevision && webIdentity.body.appEnvironment === 'production' && webIdentity.body.mode === 'durable' && webIdentity.body.registrationMode === 'canary' && webIdentity.setCookie.length === 0, 'web_identity_recheck_failed');
    evidence.statuses.push(webIdentity.status); evidence.checks.freshWebIdentity = true;
    await consumeApproval({ approvalId: approval.approvalId, runId: approval.runId, preflightReceipt: approval.preflightReceipt, accountFingerprint: approval.accountFingerprint });
    evidence.approvalConsumed = true; evidence.registerDispatches = 1;
    const registered = await request(transport, approval, 'POST', '/auth/register', { json: secrets });
    status(registered, 201, 'registration_failed'); successEnvelope(registered, 'registration', true); jar = cookieFrom(registered); evidence.sessionsCreated = 1; evidence.statuses.push(registered.status); evidence.checks.registration = evidence.checks.secureHostCookie = true;
    const me1 = await request(transport, approval, 'GET', '/auth/me', { cookie: jar }); status(me1, 200, 'me_failed'); successEnvelope(me1, 'me'); evidence.statuses.push(me1.status); evidence.checks.me = true;
    const logout1 = await request(transport, approval, 'POST', '/auth/logout', { cookie: jar, json: {} }); status(logout1, 204, 'logout_failed'); clearingCookie(logout1); evidence.statuses.push(logout1.status);
    const replay1 = await request(transport, approval, 'GET', '/auth/me', { cookie: jar }); authRequired(replay1); evidence.statuses.push(replay1.status); evidence.checks.logoutReplay = true;

    const duplicate = await request(transport, approval, 'POST', '/auth/login', { cookie: `${jar}; ${jar}`, json: { email: secrets.email, password: secrets.password } });
    const insecureCoexist = await request(transport, approval, 'POST', '/auth/login', { cookie: `${jar}; wr_session=opaque-insecure-probe`, json: { email: secrets.email, password: secrets.password } });
    const previewCoexist = await request(transport, approval, 'POST', '/auth/login', { cookie: `${jar}; wr_preview_demo_session=opaque-preview-probe`, json: { email: secrets.email, password: secrets.password } });
    for (const r of [duplicate, insecureCoexist, previewCoexist]) { exactError(r, 403, 'unsafe_auth_cookie', 'Authentication cookie is not allowed.'); evidence.statuses.push(r.status); }
    evidence.checks.cookieAmbiguity = true;

    const wrongPassword = `${secrets.password.slice(0, -1)}${secrets.password.endsWith('x') ? 'y' : 'x'}`;
    const at = secrets.email.indexOf('@'), local = secrets.email.slice(0, at), unknownEmail = `${local[0] === 'z' ? 'y' : 'z'}${local.slice(1)}${secrets.email.slice(at)}`;
    const known = await request(transport, approval, 'POST', '/auth/login', { json: { email: secrets.email, password: wrongPassword } });
    const unknown = await request(transport, approval, 'POST', '/auth/login', { json: { email: unknownEmail, password: wrongPassword } });
    for (const r of [known, unknown]) exactError(r, 401, 'invalid_credentials', 'Invalid credentials.');
    fail(canonicalJson(known.body.error) === canonicalJson(unknown.body.error), 'enumeration_response_distinction');
    fail(Number.isFinite(known.elapsedMs) && Number.isFinite(unknown.elapsedMs) && known.elapsedMs >= 0 && unknown.elapsedMs >= 0 && known.elapsedMs <= 5_000 && unknown.elapsedMs <= 5_000 && Math.abs(known.elapsedMs - unknown.elapsedMs) <= 4_000, 'enumeration_timing_unbounded');
    evidence.statuses.push(known.status, unknown.status); evidence.checks.enumerationGeneric = evidence.checks.negative = true;

    const login = await request(transport, approval, 'POST', '/auth/login', { json: { email: secrets.email, password: secrets.password } }); status(login, 200, 'login_failed'); successEnvelope(login, 'login', true); const s2 = cookieFrom(login); evidence.sessionsCreated++; evidence.statuses.push(login.status);
    const relogin = await request(transport, approval, 'POST', '/auth/login', { cookie: s2, json: { email: secrets.email, password: secrets.password } }); status(relogin, 200, 'relogin_failed'); successEnvelope(relogin, 'relogin', true); const s3 = cookieFrom(relogin); evidence.sessionsCreated++; evidence.statuses.push(relogin.status);
    fail(s2 !== s3, 'session_cookie_reused');
    const oldReplay = await request(transport, approval, 'GET', '/auth/me', { cookie: s2 }); authRequired(oldReplay); evidence.statuses.push(oldReplay.status);
    const me3 = await request(transport, approval, 'GET', '/auth/me', { cookie: s3 }); status(me3, 200, 'relogin_new_session_invalid'); successEnvelope(me3, 'me3'); evidence.statuses.push(me3.status); evidence.checks.reloginRevocation = true;
    const logout3 = await request(transport, approval, 'POST', '/auth/logout', { cookie: s3, json: {} }); status(logout3, 204, 'final_logout_failed'); clearingCookie(logout3); evidence.statuses.push(logout3.status);
    const replay3 = await request(transport, approval, 'GET', '/auth/me', { cookie: s3 }); authRequired(replay3); evidence.statuses.push(replay3.status); jar = null;
    const catalogAfter = await request(transport, approval, 'GET', '/ranked/modes'); status(catalogAfter, 200, 'catalog_after_failed'); successEnvelope(catalogAfter, 'catalog_after'); evidence.statuses.push(catalogAfter.status);
    fail(canonicalJson(catalogAfter.body.data) === catalogBefore, 'catalog_mutation_detected');
    const after = await reconciliationRead(reconciliation, { runId: approval.runId, accountFingerprint: approval.accountFingerprint });
    fail(after?.accountCount === 1 && after?.profileCount === 1 && after?.credentialCount === 1 && after?.consentCount === 0 && after?.sessionCount === 3 && after?.terminalSessionCount === 3 && after?.activeSessionCount === 0 && after.accountIdentityFingerprint === approval.accountFingerprint, 'terminal_auth_cardinality_invalid');
    fail(['lobbyWriteCount','speedWriteCount','ticketWriteCount','matchWriteCount','gameplayWriteCount','mutationWriteCount','ratingWriteCount','eventWriteCount'].every((key) => after[key] === 0) && after.sharedStateUnchanged === true && after.sharedStateFingerprint === before.sharedStateFingerprint && after.catalogFingerprint === before.catalogFingerprint, 'ranked_mutation_detected');
    fail(after.nonTargetSessionCount === before.nonTargetSessionCount && after.nonTargetSessionFingerprint === before.nonTargetSessionFingerprint, 'non_target_session_mutation_detected');
    fail(after.nonTargetAuthCount === before.nonTargetAuthCount && after.nonTargetAuthFingerprint === before.nonTargetAuthFingerprint, 'non_target_auth_mutation_detected');
    fail(after?.registerAttempts === 2 && after?.loginAttempts === 8 && after?.registerBucketCount === 2 && after?.loginBucketCount === 3 && after?.blockedBucketCount === 0, 'rate_limit_budget_invalid');
    fail(evidence.statuses.length === 21 && evidence.statuses.join(',') === '200,200,200,403,200,201,200,204,401,403,403,403,401,401,200,200,401,200,204,401,200', 'status_cardinality_invalid');
    evidence.checks.finalZeroActive = evidence.checks.rankedUnchanged = evidence.checks.nonTargetSessionsUnchanged = true; evidence.result = 'PASS';
  } catch (error) { evidence.failureCode = error instanceof ActivationFailure ? error.code : 'unexpected_failure'; }
  finally { jar = null; }
  evidence.accountFingerprint = typeof approval?.accountFingerprint === 'string' && RECEIPT.test(approval.accountFingerprint) ? approval.accountFingerprint : 'invalid';
  evidence.receipt = receiptFor(evidence); safeEvidence(evidence); return evidence;
}

export function parseSmokeArgs(args) {
  fail(!args.some((x) => /email|password|cookie|token/iu.test(x)), 'sensitive_argument_forbidden');
  fail(args.length === 4 && args[0] === '--approval' && args[2] === '--preflight' && !args[1].startsWith('-') && !args[3].startsWith('-'), 'arguments_invalid');
  return { approvalPath: args[1], preflightPath: args[3] };
}
export async function readProtectedStdin(stream, { isTTY = stream.isTTY, maxBytes = 4096 } = {}) {
  fail(!isTTY, 'stdin_tty_forbidden'); let size = 0, raw = '';
  for await (const chunk of stream) { size += Buffer.byteLength(chunk); fail(size <= maxBytes, 'stdin_oversized'); raw += chunk; }
  let parsed; try { parsed = JSON.parse(raw); } catch { throw new ActivationFailure('stdin_malformed'); }
  return validateSecrets(parsed);
}
