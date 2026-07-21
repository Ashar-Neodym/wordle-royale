import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service.ts';

const enabled = process.env.RUN_SPEED_SCHEMA_READINESS_POSTGRES_INTEGRATION === '1';
const schema = process.env.SPEED_SCHEMA_READINESS_SCHEMA ?? '';
const decoySchema = process.env.SPEED_SCHEMA_READINESS_DECOY_SCHEMA ?? '';
const safeIdentifier = /^[A-Za-z][A-Za-z0-9_]*$/;

const applicationTables = [
  'UserAccount', 'UserProfile', 'ConsentRecord', 'DictionaryRelease', 'DictionaryWord',
  'Lobby', 'Match', 'MatchRound', 'MatchParticipant', 'GuessAttempt', 'ScoreBreakdown',
  'MatchReport', 'RatingProfile', 'RatingEvent', 'LeaderboardSnapshot', 'MatchmakingTicket',
  'MatchMutationRequest', 'AnalyticsEvent', 'AuditLog',
] as const;

const lifecycleColumns = [
  ['Match', 'readyLifecycleVersion'],
  ['Match', 'invitationExpiresAt'],
  ['Match', 'readyWindowStartedAt'],
  ['Match', 'readyDeadlineAt'],
  ['Match', 'adjudicatedAt'],
  ['Match', 'completionReason'],
  ['MatchMutationRequest', 'id'],
  ['MatchMutationRequest', 'matchId'],
  ['MatchMutationRequest', 'participantId'],
  ['MatchMutationRequest', 'kind'],
  ['MatchMutationRequest', 'clientRequestId'],
  ['MatchMutationRequest', 'requestHash'],
  ['MatchMutationRequest', 'resultSnapshot'],
  ['MatchMutationRequest', 'createdAt'],
] as const;

const invitationPredicate = `"rankedMode"='speed_1v1' AND "status"='pending' AND "readyLifecycleVersion"='speed_ready_v2_first_ack_90s' AND "readyWindowStartedAt" IS NULL AND "adjudicatedAt" IS NULL`;
const readyPredicate = `"rankedMode"='speed_1v1' AND "status"='pending' AND "readyLifecycleVersion"='speed_ready_v2_first_ack_90s' AND "readyWindowStartedAt" IS NOT NULL AND "adjudicatedAt" IS NULL`;

const suite = enabled ? describe : describe.skip;
let admin: PrismaClient;
let readiness: PrismaService;

function q(value: string): string {
  assert.match(value, safeIdentifier);
  return `"${value}"`;
}

async function expectApplication(status: 'ok' | 'unavailable', label: string) {
  const result = await readiness.checkApplicationSchema();
  assert.equal(result.status, status, label);
  if (status === 'unavailable') {
    assert.equal(result.message, 'Application schema dependency is unavailable. Run database migrations before serving traffic.');
  }
}

async function expectLifecycle(status: 'ok' | 'unavailable', label: string) {
  const result = await readiness.checkSpeedReadyLifecycleSchema();
  assert.equal(result.status, status, `${label}: ${result.message ?? 'no message'}`);
  if (status === 'unavailable') {
    assert.equal(result.message, 'Speed ready lifecycle schema dependency is unavailable.');
    assert.doesNotMatch(result.message ?? '', /SELECT|pg_|postgres|schema_[a-z0-9_]+|connection/i);
  }
}

async function recreateDueIndex(name: string, keys: string, predicate: string, accessMethod = 'btree') {
  assert.match(accessMethod, /^(btree|brin)$/);
  await admin.$executeRawUnsafe(`DROP INDEX IF EXISTS ${q(schema)}.${q(name)}`);
  await admin.$executeRawUnsafe(`CREATE INDEX ${q(name)} ON ${q(schema)}."Match" USING ${accessMethod} (${keys}) WHERE ${predicate}`);
}

suite('Ticket 184 schema-isolated complete Speed lifecycle readiness', () => {
  before(async () => {
    assert.match(schema, safeIdentifier);
    assert.match(decoySchema, safeIdentifier);
    admin = new PrismaClient();
    readiness = new PrismaService();
  });

  after(async () => {
    await readiness.onModuleDestroy();
    await admin.$disconnect();
  });

  it('accepts the canonical schema despite equivalent complete objects in another schema', async () => {
    await expectApplication('ok', 'canonical application schema');
    await expectLifecycle('ok', 'canonical lifecycle schema with migrated decoy present');
  });

  it('fails application readiness for every independently missing required table and ignores decoy tables', async () => {
    for (const table of applicationTables) {
      const hidden = `ticket184_missing_${table}`;
      await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}.${q(table)} RENAME TO ${q(hidden)}`);
      try {
        await expectApplication('unavailable', `missing ${table}`);
      } finally {
        await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}.${q(hidden)} RENAME TO ${q(table)}`);
      }
      await expectApplication('ok', `restored ${table}`);
    }
  });

  it('fails lifecycle readiness for every independently missing required lifecycle column', async () => {
    for (const [table, column] of lifecycleColumns) {
      const hidden = `ticket184_missing_${column}`;
      await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}.${q(table)} RENAME COLUMN ${q(column)} TO ${q(hidden)}`);
      try {
        await expectLifecycle('unavailable', `missing ${table}.${column}`);
      } finally {
        await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}.${q(table)} RENAME COLUMN ${q(hidden)} TO ${q(column)}`);
      }
      await expectLifecycle('ok', `restored ${table}.${column}`);
    }
  });

  it('rejects wrong lifecycle column types and timestamp precision', async () => {
    await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}."Match" ALTER COLUMN "readyLifecycleVersion" TYPE varchar(255)`);
    await expectLifecycle('unavailable', 'varchar lifecycle version');
    await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}."Match" ALTER COLUMN "readyLifecycleVersion" TYPE text`);

    await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}."Match" ALTER COLUMN "invitationExpiresAt" TYPE timestamp(6)`);
    await expectLifecycle('unavailable', 'timestamp(6) invitation expiry');
    await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}."Match" ALTER COLUMN "invitationExpiresAt" TYPE timestamp(3)`);
    await expectLifecycle('ok', 'restored exact lifecycle column types');
  });

  it('requires exact current-schema lifecycle enum labels and order while ignoring duplicate decoy enums', async () => {
    await admin.$executeRawUnsafe(`ALTER TYPE ${q(schema)}."SpeedCompletionReason" RENAME VALUE 'invitation_timeout' TO 'ticket184_wrong_invitation'`);
    await expectLifecycle('unavailable', 'wrong completion enum');
    await admin.$executeRawUnsafe(`ALTER TYPE ${q(schema)}."SpeedCompletionReason" RENAME VALUE 'ticket184_wrong_invitation' TO 'invitation_timeout'`);

    await admin.$executeRawUnsafe(`ALTER TYPE ${q(schema)}."MatchMutationKind" RENAME VALUE 'speed_ready' TO 'ticket184_wrong_ready'`);
    await expectLifecycle('unavailable', 'wrong mutation enum');
    await admin.$executeRawUnsafe(`ALTER TYPE ${q(schema)}."MatchMutationKind" RENAME VALUE 'ticket184_wrong_ready' TO 'speed_ready'`);

    await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}."Match" ALTER COLUMN "completionReason" TYPE text USING "completionReason"::text`);
    await admin.$executeRawUnsafe(`DROP TYPE ${q(schema)}."SpeedCompletionReason"`);
    await admin.$executeRawUnsafe(`CREATE TYPE ${q(schema)}."SpeedCompletionReason" AS ENUM ('operator_void','all_players_terminal','deadline','forfeit','ready_timeout','invitation_timeout','pre_start_cancelled')`);
    await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}."Match" ALTER COLUMN "completionReason" TYPE ${q(schema)}."SpeedCompletionReason" USING "completionReason"::${q(schema)}."SpeedCompletionReason"`);
    await expectLifecycle('unavailable', 'wrong completion enum order');

    await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}."Match" ALTER COLUMN "completionReason" TYPE text USING "completionReason"::text`);
    await admin.$executeRawUnsafe(`DROP TYPE ${q(schema)}."SpeedCompletionReason"`);
    await admin.$executeRawUnsafe(`CREATE TYPE ${q(schema)}."SpeedCompletionReason" AS ENUM ('all_players_terminal','deadline','forfeit','ready_timeout','operator_void','invitation_timeout','pre_start_cancelled')`);
    await admin.$executeRawUnsafe(`ALTER TABLE ${q(schema)}."Match" ALTER COLUMN "completionReason" TYPE ${q(schema)}."SpeedCompletionReason" USING "completionReason"::${q(schema)}."SpeedCompletionReason"`);
    await expectLifecycle('ok', 'restored canonical enums');
  });

  it('requires exactly one non-partial unique participant/kind/request-id shape', async () => {
    const name = 'MatchMutationRequest_participantId_kind_clientRequestId_key';
    await admin.$executeRawUnsafe(`DROP INDEX ${q(schema)}.${q(name)}`);
    await expectLifecycle('unavailable', 'missing mutation uniqueness');

    await admin.$executeRawUnsafe(`CREATE UNIQUE INDEX ${q(name)} ON ${q(schema)}."MatchMutationRequest" ("kind", "participantId", "clientRequestId")`);
    await expectLifecycle('unavailable', 'wrong mutation uniqueness order');
    await admin.$executeRawUnsafe(`DROP INDEX ${q(schema)}.${q(name)}`);

    await admin.$executeRawUnsafe(`CREATE UNIQUE INDEX ${q(name)} ON ${q(schema)}."MatchMutationRequest" ("participantId" DESC, "kind", "clientRequestId")`);
    await expectLifecycle('unavailable', 'wrong mutation uniqueness ordering semantics');
    await admin.$executeRawUnsafe(`DROP INDEX ${q(schema)}.${q(name)}`);

    await admin.$executeRawUnsafe(`CREATE UNIQUE INDEX ${q(name)} ON ${q(schema)}."MatchMutationRequest" ("participantId" text_pattern_ops, "kind", "clientRequestId")`);
    await expectLifecycle('unavailable', 'wrong mutation uniqueness operator class');
    await admin.$executeRawUnsafe(`DROP INDEX ${q(schema)}.${q(name)}`);

    await admin.$executeRawUnsafe(`CREATE UNIQUE INDEX ${q(name)} ON ${q(schema)}."MatchMutationRequest" ("participantId" COLLATE "C", "kind", "clientRequestId")`);
    await expectLifecycle('unavailable', 'wrong mutation uniqueness collation');
    await admin.$executeRawUnsafe(`DROP INDEX ${q(schema)}.${q(name)}`);

    await admin.$executeRawUnsafe(`CREATE OPERATOR CLASS ${q(schema)}.text_ops FOR TYPE text USING btree AS OPERATOR 1 < (text, text), OPERATOR 2 <= (text, text), OPERATOR 3 = (text, text), OPERATOR 4 >= (text, text), OPERATOR 5 > (text, text), FUNCTION 1 pg_catalog.bttextcmp(text, text)`);
    await admin.$executeRawUnsafe(`CREATE UNIQUE INDEX ${q(name)} ON ${q(schema)}."MatchMutationRequest" ("participantId" ${q(schema)}.text_ops, "kind", "clientRequestId")`);
    await expectLifecycle('unavailable', 'same-name wrong-schema mutation operator class');
    await admin.$executeRawUnsafe(`DROP INDEX ${q(schema)}.${q(name)}`);
    await admin.$executeRawUnsafe(`DROP OPERATOR CLASS ${q(schema)}.text_ops USING btree`);

    await admin.$executeRawUnsafe(`CREATE UNIQUE INDEX ${q(name)} ON ${q(schema)}."MatchMutationRequest" ("participantId", "kind", "clientRequestId") WHERE "clientRequestId" <> ''`);
    await expectLifecycle('unavailable', 'partial mutation uniqueness');
    await admin.$executeRawUnsafe(`DROP INDEX ${q(schema)}.${q(name)}`);

    await admin.$executeRawUnsafe(`CREATE UNIQUE INDEX ${q(name)} ON ${q(schema)}."MatchMutationRequest" ("participantId", "kind", "clientRequestId")`);
    await expectLifecycle('ok', 'restored mutation uniqueness');
  });

  it('requires exact invitation due-index keys and every complete predicate conjunct', async () => {
    const name = 'speed_v2_invitation_due_idx';
    await admin.$executeRawUnsafe(`DROP INDEX ${q(schema)}.${q(name)}`);
    await expectLifecycle('unavailable', 'missing invitation index');

    const malformed = [
      [`"id", "invitationExpiresAt"`, invitationPredicate],
      [`"invitationExpiresAt" DESC, "id"`, invitationPredicate],
      [`"invitationExpiresAt", "id" COLLATE "C"`, invitationPredicate],
      [`"invitationExpiresAt", "id"`, invitationPredicate.replace(`"rankedMode"='speed_1v1' AND `, '')],
      [`"invitationExpiresAt", "id"`, invitationPredicate.replace(`"status"='pending' AND `, '')],
      [`"invitationExpiresAt", "id"`, invitationPredicate.replace(`"readyLifecycleVersion"='speed_ready_v2_first_ack_90s' AND `, '')],
      [`"invitationExpiresAt", "id"`, invitationPredicate.replace(`"readyWindowStartedAt" IS NULL AND `, '')],
      [`"invitationExpiresAt", "id"`, invitationPredicate.replace(` AND "adjudicatedAt" IS NULL`, '')],
      [`"invitationExpiresAt", "id"`, `${invitationPredicate} AND "invitationExpiresAt" IS NOT NULL`],
    ] as const;
    for (const [keys, predicate] of malformed) {
      await recreateDueIndex(name, keys, predicate);
      await expectLifecycle('unavailable', `malformed invitation index: ${predicate}`);
    }
    await recreateDueIndex(name, `"invitationExpiresAt", "id"`, `"adjudicatedAt" IS NULL AND "readyWindowStartedAt" IS NULL AND "status"='pending' AND "rankedMode"='speed_1v1' AND "readyLifecycleVersion"='speed_ready_v2_first_ack_90s'`);
    await expectLifecycle('ok', 'reordered complete invitation predicate');
    await recreateDueIndex(name, `"invitationExpiresAt", "id"`, invitationPredicate, 'brin');
    await expectLifecycle('unavailable', 'BRIN invitation index');
    await recreateDueIndex(name, `"invitationExpiresAt", "id"`, invitationPredicate);
    await expectLifecycle('ok', 'restored invitation index');
  });

  it('requires exact ready-window due-index keys and every complete predicate conjunct', async () => {
    const name = 'speed_v2_ready_due_idx';
    await admin.$executeRawUnsafe(`DROP INDEX ${q(schema)}.${q(name)}`);
    await expectLifecycle('unavailable', 'missing ready index');

    const malformed = [
      [`"id", "readyDeadlineAt"`, readyPredicate],
      [`"readyDeadlineAt" DESC, "id"`, readyPredicate],
      [`"readyDeadlineAt", "id" COLLATE "C"`, readyPredicate],
      [`"readyDeadlineAt", "id"`, readyPredicate.replace(`"rankedMode"='speed_1v1' AND `, '')],
      [`"readyDeadlineAt", "id"`, readyPredicate.replace(`"status"='pending' AND `, '')],
      [`"readyDeadlineAt", "id"`, readyPredicate.replace(`"readyLifecycleVersion"='speed_ready_v2_first_ack_90s' AND `, '')],
      [`"readyDeadlineAt", "id"`, readyPredicate.replace(`"readyWindowStartedAt" IS NOT NULL AND `, '')],
      [`"readyDeadlineAt", "id"`, readyPredicate.replace(` AND "adjudicatedAt" IS NULL`, '')],
      [`"readyDeadlineAt", "id"`, `${readyPredicate} AND "readyDeadlineAt" IS NOT NULL`],
    ] as const;
    for (const [keys, predicate] of malformed) {
      await recreateDueIndex(name, keys, predicate);
      await expectLifecycle('unavailable', `malformed ready index: ${predicate}`);
    }
    await recreateDueIndex(name, `"readyDeadlineAt", "id"`, `"adjudicatedAt" IS NULL AND "readyWindowStartedAt" IS NOT NULL AND "status"='pending' AND "rankedMode"='speed_1v1' AND "readyLifecycleVersion"='speed_ready_v2_first_ack_90s'`);
    await expectLifecycle('ok', 'reordered complete ready predicate');
    await recreateDueIndex(name, `"readyDeadlineAt", "id"`, readyPredicate, 'brin');
    await expectLifecycle('unavailable', 'BRIN ready index');
    await recreateDueIndex(name, `"readyDeadlineAt", "id"`, readyPredicate);
    await expectLifecycle('ok', 'restored ready index');
  });
});
