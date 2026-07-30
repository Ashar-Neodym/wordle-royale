import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
// @ts-expect-error Repository executable core is intentionally plain ESM.
import { APPLICATION_MODEL_TABLES, FINGERPRINT_CHUNK_ROWS, completeDatabaseFingerprint } from '../../../scripts/complete-database-fingerprint.mjs';

if (process.env.RUN_PREFLIGHT_FINGERPRINT_POSTGRES !== '1') throw new Error('disposable PostgreSQL wrapper required');

const db = new PrismaClient();
const id = () => randomUUID();
const ids = {
  user:id(), profile:id(), consent:id(), release:id(), word:id(), lobby:id(), match:id(), round:id(), participant:id(), mutation:id(),
  guess:id(), score:id(), report:id(), ratingProfile:id(), ratingEvent:id(), leaderboard:id(), ticket:id(), analytics:id(), audit:id(), activationAudit:id(),
};

async function snapshot(options?: { maxTableRows?: number }, datamodel: typeof Prisma.dmmf.datamodel = Prisma.dmmf.datamodel) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const status = await tx.$queryRawUnsafe<Array<{ transaction_read_only: string }>>('SHOW transaction_read_only');
    assert.equal(status[0]?.transaction_read_only, 'on');
    return completeDatabaseFingerprint(tx, datamodel, options);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

before(async () => {
  const now = new Date();
  await db.userAccount.create({ data: { id: ids.user, email: 'fingerprint-fixture@example.invalid', displayName: 'Fingerprint Fixture', profile: { create: { id: ids.profile, publicHandle: `fixture_${id().replaceAll('-','').slice(0,12)}` } }, passwordCredential: { create: { passwordHash: 'non-secret-disposable-hash' } }, consentRecords: { create: { id: ids.consent, scope: 'analytics_events', decision: 'denied', source: 'ticket-267', metadata: { fixture: true } } } } });
  await db.accountSession.create({ data: { id: id(), userId: ids.user, tokenHash: '1'.repeat(64), expiresAt: new Date(now.getTime() + 60_000) } });
  await db.authRateLimitBucket.create({ data: { action: 'ticket267', keyHash: '2'.repeat(64), windowStartedAt: now, attemptCount: 1 } });
  await db.dictionaryRelease.create({ data: { id: ids.release, locale: 'zz', version: `ticket267-${id()}`, status: 'draft', sourceLabel: 'disposable opaque fixture', sourceMetadata: { fixture: true }, words: { create: { id: ids.word, normalizedWord: 'opaque-fixture-not-an-answer', kind: 'banned', metadata: { fixture: true } } } } });
  await db.lobby.create({ data: { id: ids.lobby, code: `T${id().replaceAll('-','').slice(0,7)}`, hostUserId: ids.user, settings: { fixture: true } } });
  await db.match.create({ data: { id: ids.match, lobbyId: ids.lobby, dictionaryReleaseId: ids.release, idempotencyKey: `match-${id()}`, rulesetVersion: 'ticket267' } });
  await db.matchRound.create({ data: { id: ids.round, matchId: ids.match, dictionaryReleaseId: ids.release, roundNumber: 1, answerWordHash: '3'.repeat(64) } });
  await db.matchParticipant.create({ data: { id: ids.participant, matchId: ids.match, userId: ids.user, seatNumber: 1, metadata: { fixture: true } } });
  await db.matchMutationRequest.create({ data: { id: ids.mutation, matchId: ids.match, participantId: ids.participant, kind: 'speed_ready', clientRequestId: `mutation-${id()}`, requestHash: '4'.repeat(64), resultSnapshot: { fixture: true } } });
  await db.guessAttempt.create({ data: { id: ids.guess, matchId: ids.match, roundId: ids.round, participantId: ids.participant, dictionaryReleaseId: ids.release, attemptNumber: 1, normalizedGuess: 'opaque-fixture', feedback: [], serverValidation: { fixture: true }, idempotencyKey: `guess-${id()}` } });
  await db.scoreBreakdown.create({ data: { id: ids.score, matchId: ids.match, roundId: ids.round, participantId: ids.participant, category: 'fixture', points: 1, details: { fixture: true } } });
  await db.matchReport.create({ data: { id: ids.report, matchId: ids.match, participantData: { fixture: true }, publicSummary: { fixture: true } } });
  await db.ratingProfile.create({ data: { id: ids.ratingProfile, userId: ids.user, mode: 'standard_1v1', algorithmConfigVersion: 'ticket267' } });
  await db.ratingEvent.create({ data: { id: ids.ratingEvent, ratingProfileId: ids.ratingProfile, matchId: ids.match, participantId: ids.participant, type: 'adjustment', idempotencyKey: `rating-${id()}`, ratingBefore: 1500, ratingAfter: 1501, delta: 1, algorithmConfigVersion: 'ticket267', metadata: { fixture: true } } });
  await db.leaderboardSnapshot.create({ data: { id: ids.leaderboard, mode: 'standard_1v1', algorithmConfigVersion: 'ticket267', entries: [{ fixture: true }] } });
  await db.matchmakingTicket.create({ data: { id: ids.ticket, userId: ids.user, mode: 'standard_1v1', state: 'cancelled', ratingAtQueue: 1500, searchMinRating: 1400, searchMaxRating: 1600, idempotencyKey: `ticket-${id()}`, expiresAt: new Date(now.getTime() + 60_000), cancelledAt: now } });
  await db.speedLifecycleCapabilityLease.create({ data: { instanceBootId: 'ticket267', serviceId: 'service', releaseId: 'release', controlProtocol: 'ticket267', supportsV1: true, supportsV2: true, supportsLegacyReconcile: false, startedAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + 60_000) } });
  await db.speedLifecycleActivationAudit.create({ data: { id: ids.activationAudit, proofProtocol: 'speed_provider_inventory_proof_v2', proofId: id(), operation: 'fixture', approvalRef: 'fixture', operatorPrincipalHash: '5'.repeat(64), providerProjectId: 'fixture', providerEnvironmentId: 'fixture', providerServiceId: 'fixture', providerDeploymentId: 'fixture', artifactIdentity: 'fixture', releaseId: 'fixture', expectedReplicaCount: 1, inventoryDigest: '6'.repeat(64), leaseSetDigest: '7'.repeat(64), providerObservedBeforeAt: now, providerObservedAfterAt: now, fromPhase: 'v1_open', fromGeneration: 0n, toPhase: 'v1_open', toGeneration: 1n, result: 'rejected' } });
  await db.analyticsEvent.create({ data: { id: ids.analytics, userId: ids.user, matchId: ids.match, eventName: 'ticket267_fixture', payload: { fixture: true }, consentScope: 'analytics_events' } });
  await db.auditLog.create({ data: { id: ids.audit, actorUserId: ids.user, matchId: ids.match, action: 'ticket267_fixture', entityType: 'fixture', entityId: ids.match, metadata: { fixture: true } } });
});

after(async () => { await db.$disconnect(); });

test('Ticket 267 fingerprints every populated Prisma model deterministically in independent read-only transactions', async () => {
  const first = await snapshot();
  const second = await snapshot();
  assert.deepEqual(second, first);
  assert.equal(first.modelCount, 25);
  assert.equal(first.models.every((entry: { count: number }) => entry.count > 0), true);
  assert.equal(JSON.stringify(first).includes('opaque-fixture'), false);
  assert.equal(JSON.stringify(first).includes('example.invalid'), false);
  assert.equal(JSON.stringify(first).includes('non-secret-disposable-hash'), false);
});

const UPDATE_COLUMNS = new Map([
  ['UserAccount','displayName'],['PasswordCredential','passwordHash'],['AccountSession','revocationReason'],['AuthRateLimitBucket','action'],['UserProfile','bio'],['ConsentRecord','source'],['DictionaryRelease','sourceLabel'],['DictionaryWord','checksum'],['Lobby','code'],['Match','rulesetVersion'],['MatchRound','answerWordHash'],['MatchParticipant','metadata'],['MatchMutationRequest','requestHash'],['GuessAttempt','normalizedGuess'],['ScoreBreakdown','category'],['MatchReport','publicSummary'],['RatingProfile','algorithm'],['RatingEvent','algorithm'],['LeaderboardSnapshot','entries'],['MatchmakingTicket','idempotencyKey'],['SpeedLifecycleActivation','transitionReason'],['SpeedLifecycleCapabilityLease','serviceId'],['SpeedLifecycleActivationAudit','failureCode'],['AnalyticsEvent','eventName'],['AuditLog','reason'],
]);
const quote = (value: string) => `"${value.replaceAll('"','""')}"`;

test('Ticket 267 real PostgreSQL negative matrix detects content-only updates in every model group', async () => {
  for (const [,table] of APPLICATION_MODEL_TABLES) {
    const beforeState = await snapshot();
    const column = UPDATE_COLUMNS.get(table);
    assert(column, `update fixture missing for ${table}`);
    const type = await db.$queryRawUnsafe<Array<{ type_name: string }>>(`SELECT t.typname AS type_name FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_type t ON t.oid=a.atttypid WHERE c.relname=$1 AND a.attname=$2`, table, column);
    const value = type[0]?.type_name === 'jsonb' ? `'[{"ticket267":true}]'::jsonb` : `'ticket267-mutated'`;
    const guarded = table === 'SpeedLifecycleActivation' || table === 'SpeedLifecycleActivationAudit';
    if (guarded) await db.$executeRawUnsafe(`ALTER TABLE ${quote(table)} DISABLE TRIGGER USER`);
    try { await db.$executeRawUnsafe(`UPDATE ${quote(table)} SET ${quote(column)}=${value}`); }
    finally { if (guarded) await db.$executeRawUnsafe(`ALTER TABLE ${quote(table)} ENABLE TRIGGER USER`); }
    const afterState = await snapshot();
    const index = APPLICATION_MODEL_TABLES.findIndex((entry: readonly [string,string]) => entry[1] === table);
    assert.equal(afterState.models[index].count, beforeState.models[index].count);
    assert.notEqual(afterState.models[index].digest, beforeState.models[index].digest, `${table} content update must change its digest`);
  }
});

test('Ticket 267 real PostgreSQL detects inserts/deletes and fails closed on table/type drift', async () => {
  const baseline = await snapshot();
  const inserted = id();
  await db.auditLog.create({ data: { id: inserted, action: 'insert_probe', entityType: 'fixture' } });
  const afterInsert = await snapshot();
  assert.notEqual(afterInsert.stateDigest, baseline.stateDigest);
  await db.auditLog.delete({ where: { id: inserted } });
  const afterDelete = await snapshot();
  assert.notEqual(afterDelete.stateDigest, afterInsert.stateDigest);

  await db.$executeRawUnsafe('CREATE TABLE "Ticket267Unexpected" (id text)');
  await assert.rejects(snapshot(), /complete_fingerprint_manifest_drift/u);
  await db.$executeRawUnsafe('DROP TABLE "Ticket267Unexpected"');
  await db.$executeRawUnsafe('ALTER TABLE "AuditLog" ADD COLUMN "ticket267Drift" text');
  await assert.rejects(snapshot(), /complete_fingerprint_schema_drift/u);
  await db.$executeRawUnsafe('ALTER TABLE "AuditLog" DROP COLUMN "ticket267Drift"');
  await db.$executeRawUnsafe('ALTER TABLE "AuditLog" ADD COLUMN "ticket267Unsupported" integer[]');
  await assert.rejects(snapshot(), /complete_fingerprint_schema_drift/u);
  await db.$executeRawUnsafe('ALTER TABLE "AuditLog" DROP COLUMN "ticket267Unsupported"');

  await db.$executeRawUnsafe('ALTER TABLE "AccountSession" ALTER COLUMN "revocationReason" TYPE varchar(33)');
  await assert.rejects(snapshot(), /complete_fingerprint_schema_drift/u, 'varchar native length drift must fail');
  await db.$executeRawUnsafe('ALTER TABLE "AccountSession" ALTER COLUMN "revocationReason" TYPE varchar(32)');

  await db.$executeRawUnsafe('ALTER TABLE "SpeedLifecycleActivationAudit" ALTER COLUMN "providerObservedBeforeAt" TYPE timestamptz(5)');
  await assert.rejects(snapshot(), /complete_fingerprint_schema_drift/u, 'timestamp precision drift must fail');
  // The migration uses PostgreSQL's omitted/default precision, which is
  // semantically precision 6 but has exact typmod -1.
  await db.$executeRawUnsafe('ALTER TABLE "SpeedLifecycleActivationAudit" ALTER COLUMN "providerObservedBeforeAt" TYPE timestamptz');

  await db.$executeRawUnsafe('ALTER TABLE "UserProfile" ALTER COLUMN "bio" SET NOT NULL');
  await assert.rejects(snapshot(), /complete_fingerprint_schema_drift/u, 'nullability drift must fail');
  await db.$executeRawUnsafe('ALTER TABLE "UserProfile" ALTER COLUMN "bio" DROP NOT NULL');

  await db.$executeRawUnsafe('ALTER TABLE "AuditLog" ALTER COLUMN "reason" TYPE varchar(80)');
  await assert.rejects(snapshot(), /complete_fingerprint_schema_drift/u, 'scalar type drift must fail');
  await db.$executeRawUnsafe('ALTER TABLE "AuditLog" ALTER COLUMN "reason" TYPE text');

  const numericDatamodel = structuredClone(Prisma.dmmf.datamodel) as typeof Prisma.dmmf.datamodel;
  const numericField = numericDatamodel.models.find((model) => model.name === 'AuditLog')?.fields.find((field) => field.name === 'metadata');
  assert(numericField);
  Object.assign(numericField, { type: 'Decimal', nativeType: ['Decimal', ['12', '4']] });
  await db.$executeRawUnsafe('ALTER TABLE "AuditLog" ALTER COLUMN "metadata" TYPE numeric(12,5) USING NULL');
  await assert.rejects(snapshot(undefined, numericDatamodel), /complete_fingerprint_schema_drift/u, 'numeric scale drift must fail');
  await db.$executeRawUnsafe('ALTER TABLE "AuditLog" ALTER COLUMN "metadata" TYPE numeric(13,4)');
  await assert.rejects(snapshot(undefined, numericDatamodel), /complete_fingerprint_schema_drift/u, 'numeric precision drift must fail');
  await db.$executeRawUnsafe('ALTER TABLE "AuditLog" ALTER COLUMN "metadata" TYPE jsonb USING NULL');

  const malformedNativeArgs = structuredClone(Prisma.dmmf.datamodel) as typeof Prisma.dmmf.datamodel;
  const varcharField = malformedNativeArgs.models.find((model) => model.name === 'AccountSession')?.fields.find((field) => field.name === 'revocationReason');
  assert(varcharField);
  Object.assign(varcharField, { nativeType: ['VarChar', ['32', 'unexpected']] });
  await assert.rejects(snapshot(undefined, malformedNativeArgs), /complete_fingerprint_prisma_manifest_invalid/u, 'native type arguments must have exact arity');

  await db.$executeRawUnsafe(`ALTER TYPE "ConsentScope" RENAME VALUE 'training_insights_opt_in' TO 'ticket267_label_drift'`);
  await assert.rejects(snapshot(), /complete_fingerprint_schema_drift/u, 'enum label drift must fail');
  await db.$executeRawUnsafe(`ALTER TYPE "ConsentScope" RENAME VALUE 'ticket267_label_drift' TO 'training_insights_opt_in'`);
});

test('Ticket 267 chunked aggregation is deterministic and update-sensitive at representative scale within a frozen bound', async () => {
  const scaleRows = FINGERPRINT_CHUNK_ROWS + 257;
  await db.$executeRawUnsafe(`INSERT INTO "AuditLog" (id, action, "entityType") SELECT 'ticket267-scale-' || lpad(g::text, 8, '0'), 'scale', 'fixture' FROM generate_series(1, ${scaleRows}) g`);
  const started = performance.now();
  const first = await snapshot();
  const second = await snapshot();
  assert.deepEqual(second, first);
  await db.$executeRawUnsafe(`UPDATE "AuditLog" SET reason='changed' WHERE id='ticket267-scale-${String(scaleRows).padStart(8, '0')}'`);
  const changed = await snapshot();
  const auditIndex = APPLICATION_MODEL_TABLES.findIndex((entry: readonly [string,string]) => entry[1] === 'AuditLog');
  assert.equal(changed.models[auditIndex].count, first.models[auditIndex].count);
  assert.notEqual(changed.models[auditIndex].digest, first.models[auditIndex].digest);
  const elapsedMs = performance.now() - started;
  assert(elapsedMs < 20_000, `representative chunked fingerprint exceeded 20000ms bound: ${elapsedMs}`);
});

test('Ticket 267 cardinality ceiling fails closed and rejects unsafe limit configuration', async () => {
  await assert.rejects(snapshot({ maxTableRows: 100 }), /complete_fingerprint_table_cardinality_exceeded/u);
  await assert.rejects(snapshot({ maxTableRows: Number.MAX_SAFE_INTEGER }), /complete_fingerprint_limit_invalid/u);
});

test('Ticket 267 exact enum ordering fails closed', async () => {
  await db.$executeRawUnsafe(`ALTER TYPE "ConsentScope" ADD VALUE 'ticket267_order_drift' BEFORE 'analytics_events'`);
  await assert.rejects(snapshot(), /complete_fingerprint_schema_drift/u, 'enum label insertion/order drift must fail');
});
