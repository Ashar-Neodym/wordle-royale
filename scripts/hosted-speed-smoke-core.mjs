import { performance } from 'node:perf_hooks';

export const ROUTES = Object.freeze({
  health: '/healthz', ready: '/readyz', catalog: '/ranked/modes', session: '/auth/preview-demo/start',
  queue: '/matchmaking/speed-1v1/tickets', currentSpeed: '/matchmaking/speed-1v1/tickets/current',
  currentStandard: '/matchmaking/standard-1v1/tickets/current',
  state: (id) => `/matches/${id}/state`, readyMatch: (id) => `/matches/${id}/ready`,
  forfeit: (id) => `/matches/${id}/forfeit`, result: (id) => `/matches/${id}/result`,
  history: '/matches/history/me?limit=5', profile: (handle, mode = 'speed_1v1') => `/profiles/${handle}/rating?mode=${mode}`,
  leaderboard: (mode) => `/leaderboard?mode=${mode}&limit=20`,
});

const EXPECTED = Object.freeze({ lifecycle: 'speed_ready_v2_first_ack_90s', rules: 'speed_1v1_v1_75s', rating: 'speed_1v1_glicko_v1', invitationMs: 90_000, readyMs: 20_000, countdownMs: 3_000, roundMs: 75_000 });
// Public progress legitimately contains guess counters and the viewer's accepted
// guesses.  Reject only answer authority/secrets, rather than words containing
// "guess" or generic hashes used for unrelated public identities.
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'answer', 'answerword', 'answerwordhash', 'answersalt', 'answerhash',
  'solution', 'solutionword', 'solutionhash', 'solutionsalt',
  'secret', 'puzzlesecret', 'serversecret', 'signingsecret',
]);
const EVIDENCE_SECRET_KEY = /(cookie|token|secret|password|answer|hash|salt|guess|authorization|clientRequestId|operationId|matchId|roundId|userId)/i;
export class SmokeFailure extends Error { constructor(code) { super(code); this.name = 'SmokeFailure'; this.code = code; } }
const fail = (condition, code) => { if (!condition) throw new SmokeFailure(code); };
const ok = (r) => Number.isInteger(r?.status) && r.status >= 200 && r.status < 300;
const data = (r) => r?.body && Object.hasOwn(r.body, 'data') ? r.body.data : r?.data ?? r?.body;
const close = (actual, expected, tolerance) => Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
const parse = (value) => { const n = Date.parse(value); return Number.isFinite(n) ? n : NaN; };
function scanKeys(value, matcher, code, path = '') { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { fail(!matcher.test(key), `${code}:${path}${key}`); scanKeys(child, matcher, code, `${path}${key}.`); } }
function assertPublicSafe(value, path = '') { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { fail(!FORBIDDEN_PUBLIC_KEYS.has(key.toLowerCase()), `public_payload_forbidden_authority:${path}${key}`); assertPublicSafe(child, `${path}${key}.`); } }
export const assertPublicPayloadSafe = (value) => { assertPublicSafe(value); return true; };
function assertObject(value, code) { fail(value && typeof value === 'object' && !Array.isArray(value), code); return value; }
function profileShape(value, mode) { const p = assertObject(value, 'profile_payload_invalid'); fail(typeof p.userId === 'string' && typeof p.handle === 'string' && p.mode === mode && Number.isInteger(p.rating) && Number.isInteger(p.matchesPlayed) && p.algorithm === (mode === 'speed_1v1' ? EXPECTED.rating : 'standard_1v1_glicko_v1') && p.algorithmConfigVersion === p.algorithm, 'profile_payload_invalid'); return p; }
function boardShape(value, mode) { const b = assertObject(value, 'leaderboard_payload_invalid'); const algorithm = mode === 'speed_1v1' ? EXPECTED.rating : 'standard_1v1_glicko_v1'; fail(b.mode === mode && b.algorithm === algorithm && b.algorithmConfigVersion === algorithm && Array.isArray(b.entries), 'leaderboard_payload_invalid'); for (const e of b.entries) fail(typeof e.userId === 'string' && typeof e.handle === 'string' && Number.isInteger(e.rating) && Number.isInteger(e.matchesPlayed), 'leaderboard_payload_invalid'); return b; }
function historyShape(value) { const h = assertObject(value, 'history_payload_invalid'); fail(Array.isArray(h.items) && h.pagination && Object.hasOwn(h.pagination, 'nextCursor'), 'history_payload_invalid'); return h; }
export function snapshotShape(value, matchId) { const s = assertObject(value, 'state_payload_invalid'); const guessesUsed = s.myState?.guessesUsed; fail(s.matchId === matchId && typeof s.roundId === 'string' && s.mode === 'speed_1v1' && s.rulesetVersion === EXPECTED.rules && s.readyLifecycleVersion === EXPECTED.lifecycle && s.readiness && Number.isInteger(s.readiness.readyCount) && s.timeControl?.roundTimeMs === EXPECTED.roundMs && s.timeControl?.maxGuesses === 6 && s.timeControl?.solveTimeBucketMs === 100 && Array.isArray(s.myState?.acceptedGuesses) && (guessesUsed === null || (Number.isInteger(guessesUsed) && guessesUsed >= 1 && guessesUsed <= s.timeControl.maxGuesses)) && Number.isInteger(s.opponentProgress?.acceptedGuessCount), 'state_payload_invalid'); return s; }
function assertReadyIdentity(snapshots, tolerance) {
  fail(snapshots.length >= 2, 'ready_transition_not_proven');
  for (const s of snapshots) for (const key of ['readyWindowStartedAt', 'readyDeadlineAt']) fail(typeof s[key] === 'string' && Number.isFinite(parse(s[key])), `immutable_${key}_missing`);
  for (const key of ['readyWindowStartedAt', 'readyDeadlineAt']) fail(new Set(snapshots.map((s) => s[key])).size === 1, `immutable_${key}_mismatch`);
  const authoritative = snapshots.filter((s) => s.readiness.readyCount === 2 && s.readiness.phase === 'locked');
  fail(authoritative.length >= 1, 'two_ready_transition_not_proven');
  for (const s of authoritative) for (const key of ['startsAt', 'deadlineAt']) fail(typeof s[key] === 'string' && Number.isFinite(parse(s[key])), `immutable_${key}_missing`);
  for (const key of ['startsAt', 'deadlineAt']) fail(new Set(authoritative.map((s) => s[key])).size === 1, `immutable_${key}_mismatch`);
  const s = authoritative[0];
  fail(close(parse(s.readyDeadlineAt) - parse(s.readyWindowStartedAt), EXPECTED.readyMs, tolerance), 'ready_deadline_budget_mismatch');
  fail(close(parse(s.deadlineAt) - parse(s.startsAt), EXPECTED.roundMs, tolerance), 'round_deadline_budget_mismatch');
  return s;
}
function resultShape(value, matchId, actorIds) {
  const r = assertObject(value, 'result_payload_invalid');
  fail(r.matchId === matchId && r.state === 'completed' && r.rankedMode === 'speed_1v1' && r.rulesetVersion === EXPECTED.rules && r.ratingAlgorithm === EXPECTED.rating && r.ratingAlgorithmConfigVersion === EXPECTED.rating && r.ratingEvent?.status === 'applied' && r.ratingEvent?.matchId === matchId && r.ratingEvent?.algorithmVersion === EXPECTED.rating, 'result_payload_invalid');
  const ps = r.ratingEvent.participants; fail(Array.isArray(ps) && ps.length === 2 && new Set(ps.map((p) => p.userId)).size === 2 && actorIds.every((id) => ps.some((p) => p.userId === id)), 'result_participants_invalid');
  for (const p of ps) fail(Number.isInteger(p.ratingBefore) && Number.isInteger(p.ratingAfter) && Number.isInteger(p.ratingDelta) && p.ratingAfter - p.ratingBefore === p.ratingDelta, 'result_rating_invalid');
  return r;
}
const stable = (v) => JSON.stringify(v);

/** Exactly one lifecycle. Transport is injected for deterministic local tests. */
export async function runHostedSpeedSmoke({ transport, expectedRevision, operationIds, monotonicNow = () => performance.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), readyRequestTimeoutMs = 35_000, recoveryReserveMs = 5_000, timingToleranceMs = 25 }) {
  fail(transport && typeof transport.request === 'function', 'transport_required'); fail(expectedRevision, 'expected_revision_required'); fail(Array.isArray(operationIds) && operationIds.length === 5 && new Set(operationIds).size === 5, 'five_unique_operation_ids_required');
  const evidence = { schemaVersion: 2, result: 'FAIL', preflight: { completedBeforeSessions: false, health: false, readiness: false, catalog: false, revisionMatch: false }, sessionsCreated: 0, queuePosts: 0, lifecycleCount: 0, ready: { postCount: 0, statuses: [], durationsMs: [], dispatchSkewMs: null, recoveredByCurrentState: 0, blindRetries: 0 }, deadlines: { invitationBudgetAsserted: false, immutableFirstAck: false, immutableStart: false }, checks: { distinctActors: false, reconnect: false, settlement: false, ratingHistoryProfileLeaderboard: false, standardIsolation: false, spoilerSafe: false, cleanup: false } };
  const req = async (actor, method, path, body) => { const r = await transport.request({ actor, method, path, ...(body ? { body } : {}) }); if (ok(r)) assertPublicSafe(r.body); return r; };
  try {
    const [healthR, readyR, catalogR] = await Promise.all([req(null, 'GET', ROUTES.health), req(null, 'GET', ROUTES.ready), req(null, 'GET', ROUTES.catalog)]);
    fail(ok(healthR) && data(healthR)?.status === 'ok', 'health_preflight_failed'); evidence.preflight.health = true;
    const readiness = data(readyR); fail(ok(readyR) && readiness?.status === 'ok', 'readiness_preflight_failed'); fail(readiness.revision === expectedRevision, 'revision_mismatch'); fail(readiness.dependencies?.speedRuntime?.status === 'ok' && readiness.dependencies?.speedLifecycleActivation?.status === 'ok', 'speed_readiness_failed'); evidence.preflight.readiness = evidence.preflight.revisionMatch = true;
    const modes = data(catalogR)?.modes; const speed = modes?.find((m) => m.id === 'speed_1v1'); const standard = modes?.find((m) => m.id === 'standard_1v1'); const tc = speed?.timeControl; fail(ok(catalogR) && speed?.enabled === true && speed?.queueEnabled === true && speed.readyLifecycleVersion === EXPECTED.lifecycle && speed.rulesetVersion === EXPECTED.rules && speed.ratingAlgorithmConfigVersion === EXPECTED.rating && tc?.roundTimeSeconds === 75 && tc?.invitationWindowSeconds === 90 && tc?.readyWindowSeconds === 20 && tc?.readyWindowStartsOn === 'first_valid_ready_acknowledgement' && tc?.countdownSeconds === 3 && tc?.maxGuesses === 6 && tc?.solveTimeBucketMs === 100 && tc?.tieBreaker === 'server_solve_time_bucket', 'speed_catalog_mismatch'); fail(standard?.id === 'standard_1v1' && standard.enabled === true, 'standard_catalog_unavailable'); evidence.preflight.catalog = evidence.preflight.completedBeforeSessions = true;
    const sessions = []; for (const actor of ['one', 'two']) { const r = await req(actor, 'POST', ROUTES.session); const s = data(r); fail(ok(r) && typeof s?.user?.id === 'string' && typeof s.user.profile?.handle === 'string' && typeof r.sessionIdentity === 'string', 'session_identity_missing'); sessions.push({ actor, userId: s.user.id, handle: s.user.profile.handle, sessionIdentity: r.sessionIdentity }); evidence.sessionsCreated++; }
    fail(new Set(sessions.map((s) => s.sessionIdentity)).size === 2, 'duplicate_session_cookie'); fail(new Set(sessions.map((s) => s.handle)).size === 2, 'duplicate_actor_handle'); fail(new Set(sessions.map((s) => s.userId)).size === 2, 'duplicate_actor_user'); evidence.checks.distinctActors = true;
    const before = { histories: [], speedProfiles: [], standardProfiles: [] };
    for (const s of sessions) { const [h, sp, st] = await Promise.all([req(s.actor, 'GET', ROUTES.history), req(s.actor, 'GET', ROUTES.profile(s.handle)), req(s.actor, 'GET', ROUTES.profile(s.handle, 'standard_1v1'))]); fail([h, sp, st].every(ok), 'baseline_read_failed'); before.histories.push(historyShape(data(h))); before.speedProfiles.push(profileShape(data(sp), 'speed_1v1')); before.standardProfiles.push(profileShape(data(st), 'standard_1v1')); }
    const [speedBoardBeforeR, standardBoardBeforeR] = await Promise.all([req(null, 'GET', ROUTES.leaderboard('speed_1v1')), req(null, 'GET', ROUTES.leaderboard('standard_1v1'))]); fail(ok(speedBoardBeforeR) && ok(standardBoardBeforeR), 'baseline_read_failed'); const speedBoardBefore = boardShape(data(speedBoardBeforeR), 'speed_1v1'); const standardBoardBefore = boardShape(data(standardBoardBeforeR), 'standard_1v1');
    const queued = await Promise.all(sessions.map(async (s, i) => { evidence.queuePosts++; const r = await req(s.actor, 'POST', ROUTES.queue, { mode: 'speed_1v1', rated: true, allowProvisionalOpponent: true, clientRequestId: operationIds[i] }); fail(ok(r), 'queue_failed'); return data(r); }));
    const tickets = await Promise.all(queued.map(async (t, i) => t?.matchedMatchId ? t : data(await req(sessions[i].actor, 'GET', ROUTES.currentSpeed))));
    fail(tickets.every((t, i) => typeof t?.ticketId === 'string' && t.state === 'matched' && t.userId === sessions[i].userId), 'ticket_identity_invalid');
    fail(new Set(tickets.map((t) => t.ticketId)).size === 2, 'distinct_ticket_identity_required'); const matchIds = new Set(tickets.map((t) => t.matchedMatchId)); fail(matchIds.size === 1 && ![...before.histories[0].items, ...before.histories[1].items].some((x) => x.matchId === tickets[0].matchedMatchId), 'exactly_one_fresh_match_required');
    const matchId = tickets[0].matchedMatchId; fail(tickets.every((t, i) => t.matchedOpponent?.userId === sessions[1 - i].userId), 'distinct_match_participants_required'); evidence.lifecycleCount = 1;
    const initialR = await req('one', 'GET', ROUTES.state(matchId)); fail(ok(initialR), 'initial_state_failed'); const initial = snapshotShape(data(initialR), matchId); fail(initial.readiness.readyCount === 0 && initial.readyWindowStartedAt === null && initial.readyDeadlineAt === null && initial.startsAt === null && initial.deadlineAt === null, 'initial_invitation_state_invalid');
    const invitationBudget = parse(initial.invitationExpiresAt) - parse(initial.serverTime); fail(Number.isFinite(invitationBudget) && invitationBudget > readyRequestTimeoutMs + recoveryReserveMs, 'invitation_deadline_budget_insufficient'); evidence.deadlines.invitationBudgetAsserted = true;
    const readyIds = operationIds.slice(2, 4); const dispatches = sessions.map((s, i) => { const dispatchedAt = monotonicNow(); evidence.ready.postCount++; return { ...s, dispatchedAt, promise: req(s.actor, 'POST', ROUTES.readyMatch(matchId), { clientRequestId: readyIds[i] }) }; }); evidence.ready.dispatchSkewMs = Math.abs(dispatches[1].dispatchedAt - dispatches[0].dispatchedAt);
    const settled = await Promise.allSettled(dispatches.map((d) => d.promise)); const postReady = [];
    for (const o of settled) { if (o.status === 'fulfilled') { evidence.ready.statuses.push(o.value.status); evidence.ready.durationsMs.push(Number(o.value.durationMs ?? 0)); } else { evidence.ready.statuses.push(o.reason?.code === 'TIMEOUT' || o.reason?.name === 'TimeoutError' ? 'timeout' : 'transport_error'); evidence.ready.durationsMs.push(Number(o.reason?.durationMs ?? 0)); } }
    fail(settled.every((o) => o.status !== 'fulfilled' || ok(o.value)), 'ready_non_success_safe_stop'); fail(settled.every((o) => o.status === 'fulfilled' || o.reason?.code === 'TIMEOUT' || o.reason?.name === 'TimeoutError'), 'ready_transport_failure');
    for (let i = 0; i < 2; i++) if (settled[i].status === 'fulfilled') { const s = snapshotShape(data(settled[i].value), matchId); fail(s.readiness.viewerReady && s.readiness.viewerReadyOperationId === readyIds[i], 'ready_operation_identity_mismatch'); postReady.push(s); }
    const recoveryIndex = settled.findIndex((o) => o.status === 'rejected'); const recoveryActor = sessions[recoveryIndex < 0 ? 0 : recoveryIndex]; const recovery = await req(recoveryActor.actor, 'GET', ROUTES.state(matchId)); fail(ok(recovery), 'ready_recovery_read_failed'); const recovered = snapshotShape(data(recovery), matchId); fail(recovered.readiness.viewerReady && recovered.readiness.viewerReadyOperationId === readyIds[recoveryIndex < 0 ? 0 : recoveryIndex], 'ready_operation_identity_mismatch'); postReady.push(recovered); evidence.ready.recoveredByCurrentState = 1;
    const authoritative = assertReadyIdentity(postReady, timingToleranceMs); evidence.deadlines.immutableFirstAck = evidence.deadlines.immutableStart = evidence.checks.reconnect = true;
    const untilStart = parse(authoritative.startsAt) - parse(authoritative.serverTime); fail(untilStart >= 0 && untilStart <= EXPECTED.countdownMs + timingToleranceMs, 'countdown_identity_budget_mismatch'); if (untilStart > 0) await sleep(untilStart + timingToleranceMs);
    const forfeited = await req('one', 'POST', ROUTES.forfeit(matchId), { clientRequestId: operationIds[4] }); fail(ok(forfeited) && data(forfeited)?.state === 'completed' && data(forfeited)?.matchId === matchId, 'controlled_settlement_failed'); evidence.checks.settlement = true;
    const [resultR, ...afterR] = await Promise.all([
      req(null, 'GET', ROUTES.result(matchId)),
      ...sessions.flatMap((s) => [req(s.actor, 'GET', ROUTES.history), req(s.actor, 'GET', ROUTES.profile(s.handle)), req(s.actor, 'GET', ROUTES.profile(s.handle, 'standard_1v1'))]),
      req(null, 'GET', ROUTES.leaderboard('speed_1v1')), req(null, 'GET', ROUTES.leaderboard('standard_1v1')),
      ...sessions.map((s) => req(s.actor, 'GET', ROUTES.currentSpeed)), ...sessions.map((s) => req(s.actor, 'GET', ROUTES.currentStandard)), ...sessions.map((s) => req(s.actor, 'GET', ROUTES.state(matchId))),
    ]);
    fail(ok(resultR) && afterR.every(ok), 'convergence_check_failed'); const result = resultShape(data(resultR), matchId, sessions.map((s) => s.userId));
    const histories = [historyShape(data(afterR[0])), historyShape(data(afterR[3]))]; const profiles = [profileShape(data(afterR[1]), 'speed_1v1'), profileShape(data(afterR[4]), 'speed_1v1')]; const standardProfiles = [profileShape(data(afterR[2]), 'standard_1v1'), profileShape(data(afterR[5]), 'standard_1v1')]; const speedBoard = boardShape(data(afterR[6]), 'speed_1v1'); const standardBoard = boardShape(data(afterR[7]), 'standard_1v1');
    for (let i = 0; i < 2; i++) { const delta = result.ratingEvent.participants.find((p) => p.userId === sessions[i].userId); const items = histories[i].items.filter((x) => x.matchId === matchId); fail(items.length === 1 && items[0].status === 'completed' && items[0].rankedMode === 'speed_1v1' && items[0].rulesetVersion === EXPECTED.rules && items[0].ratingAlgorithm === EXPECTED.rating && items[0].ratingAlgorithmConfigVersion === EXPECTED.rating && items[0].viewer?.userId === sessions[i].userId && items[0].viewer.ratingDelta === delta.ratingDelta && new Set(items[0].participants.map((p) => p.userId)).size === 2, 'history_not_converged'); fail(profiles[i].rating === delta.ratingAfter && profiles[i].rating - before.speedProfiles[i].rating === delta.ratingDelta && profiles[i].matchesPlayed === before.speedProfiles[i].matchesPlayed + 1, 'profile_not_converged'); const row = speedBoard.entries.find((e) => e.userId === sessions[i].userId); fail(row?.rating === profiles[i].rating && row.matchesPlayed === profiles[i].matchesPlayed, 'leaderboard_not_converged'); }
    fail(stable(standardProfiles) === stable(before.standardProfiles) && stable(standardBoard) === stable(standardBoardBefore), 'standard_not_isolated'); fail(speedBoard.entries.length >= speedBoardBefore.entries.length, 'leaderboard_not_converged'); evidence.checks.ratingHistoryProfileLeaderboard = evidence.checks.standardIsolation = true;
    const currentSpeed = afterR.slice(8, 10).map(data); const currentStandard = afterR.slice(10, 12).map(data); const terminal = afterR.slice(12, 14).map(data); fail(currentSpeed.every((x) => x == null) && currentStandard.every((x) => x == null) && terminal.every((x) => x?.matchId === matchId && x?.state === 'completed'), 'terminal_cleanup_not_verified'); evidence.checks.cleanup = true;
    evidence.checks.spoilerSafe = true; evidence.result = 'PASS'; scanKeys(evidence, EVIDENCE_SECRET_KEY, 'sanitization_forbidden_key'); return evidence;
  } catch (error) { evidence.failureCode = error instanceof SmokeFailure ? error.code : 'unexpected_failure'; scanKeys(evidence, EVIDENCE_SECRET_KEY, 'sanitization_forbidden_key'); return evidence; }
}
export function assertSanitizedEvidence(evidence) { scanKeys(evidence, EVIDENCE_SECRET_KEY, 'sanitization_forbidden_key'); return true; }
