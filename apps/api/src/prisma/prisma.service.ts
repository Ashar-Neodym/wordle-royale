import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { ReadinessDependency } from '@wordle-royale/contracts';

export type PrismaClientLike = {
  $queryRaw?: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $queryRawUnsafe?: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>;
  $disconnect?: () => Promise<void>;
  userAccount: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown>;
  };
  userProfile: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown>;
    count: (args: unknown) => Promise<number>;
  };
  lobby: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown[]>;
    findUnique: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
};

const requiredApplicationTables = [
  'UserAccount',
  'UserProfile',
  'ConsentRecord',
  'DictionaryRelease',
  'DictionaryWord',
  'Lobby',
  'Match',
  'MatchRound',
  'MatchParticipant',
  'GuessAttempt',
  'ScoreBreakdown',
  'MatchReport',
  'RatingProfile',
  'RatingEvent',
  'LeaderboardSnapshot',
  'MatchmakingTicket',
  'MatchMutationRequest',
  'AnalyticsEvent',
  'AuditLog',
] as const;

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly prisma = new PrismaClient();

  get client(): PrismaClientLike {
    return this.prisma as unknown as PrismaClientLike;
  }

  async checkDatabase(): Promise<ReadinessDependency> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();

    try {
      if (this.client.$queryRaw) {
        await this.client.$queryRaw`SELECT 1`;
      }
      return { status: 'ok', checkedAt, latencyMs: Date.now() - startedAt };
    } catch (error) {
      void error;
      return {
        status: 'unavailable',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: 'Database dependency is unavailable.',
      };
    }
  }

  async checkApplicationSchema(): Promise<ReadinessDependency> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();

    try {
      if (!this.client.$queryRawUnsafe) {
        return {
          status: 'not_checked_stub',
          checkedAt,
          message: 'Application schema readiness check is unavailable for this Prisma client.',
        };
      }

      const requiredTableList = requiredApplicationTables.map(sqlStringLiteral).join(', ');
      const rows = await this.client.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_type = 'BASE TABLE'
            AND table_name IN (${requiredTableList})`,
      );
      const foundTables = new Set(rows.map((row) => row.table_name));
      const missingTables = requiredApplicationTables.filter((tableName) => !foundTables.has(tableName));

      if (missingTables.length > 0) {
        return {
          status: 'unavailable',
          checkedAt,
          latencyMs: Date.now() - startedAt,
          message: 'Application schema dependency is unavailable. Run database migrations before serving traffic.',
        };
      }

      return {
        status: 'ok',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `Application schema contains ${requiredApplicationTables.length} required table(s).`,
      };
    } catch (error) {
      void error;
      return {
        status: 'unavailable',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: 'Application schema dependency is unavailable. Run database migrations before serving traffic.',
      };
    }
  }

  async checkSpeedReadyLifecycleSchema(includeActivation = true): Promise<ReadinessDependency> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      if (!this.client.$queryRawUnsafe) return { status: 'not_checked_stub', checkedAt };
      const rows = await this.client.$queryRawUnsafe<Array<{
        columns_ok: boolean;
        enums_ok: boolean;
        mutation_unique_ok: boolean;
        indexes_ok: boolean;
      }>>(
        `WITH expected_columns(table_name, column_name, data_type, udt_schema, udt_name, is_nullable, datetime_precision) AS (
           VALUES
             ('Match', 'readyLifecycleVersion', 'text', 'pg_catalog', 'text', 'YES', NULL::integer),
             ('Match', 'invitationExpiresAt', 'timestamp without time zone', 'pg_catalog', 'timestamp', 'YES', 3),
             ('Match', 'readyWindowStartedAt', 'timestamp without time zone', 'pg_catalog', 'timestamp', 'YES', 3),
             ('Match', 'readyDeadlineAt', 'timestamp without time zone', 'pg_catalog', 'timestamp', 'YES', 3),
             ('Match', 'adjudicatedAt', 'timestamp without time zone', 'pg_catalog', 'timestamp', 'YES', 3),
             ('Match', 'completionReason', 'USER-DEFINED', current_schema(), 'SpeedCompletionReason', 'YES', NULL::integer),
             ('MatchMutationRequest', 'id', 'text', 'pg_catalog', 'text', 'NO', NULL::integer),
             ('MatchMutationRequest', 'matchId', 'text', 'pg_catalog', 'text', 'NO', NULL::integer),
             ('MatchMutationRequest', 'participantId', 'text', 'pg_catalog', 'text', 'NO', NULL::integer),
             ('MatchMutationRequest', 'kind', 'USER-DEFINED', current_schema(), 'MatchMutationKind', 'NO', NULL::integer),
             ('MatchMutationRequest', 'clientRequestId', 'text', 'pg_catalog', 'text', 'NO', NULL::integer),
             ('MatchMutationRequest', 'requestHash', 'text', 'pg_catalog', 'text', 'NO', NULL::integer),
             ('MatchMutationRequest', 'resultSnapshot', 'jsonb', 'pg_catalog', 'jsonb', 'YES', NULL::integer),
             ('MatchMutationRequest', 'createdAt', 'timestamp without time zone', 'pg_catalog', 'timestamp', 'NO', 3)
         ), columns_shape AS (
           SELECT count(c.column_name) = count(*)
              AND bool_and(c.data_type = e.data_type
                       AND c.udt_schema = e.udt_schema
                       AND c.udt_name = e.udt_name
                       AND c.is_nullable = e.is_nullable
                       AND c.datetime_precision IS NOT DISTINCT FROM e.datetime_precision) AS ok
             FROM expected_columns e
             LEFT JOIN information_schema.columns c
               ON c.table_schema = current_schema()
              AND c.table_name = e.table_name
              AND c.column_name = e.column_name
         ), expected_enums(type_name, labels) AS (
           VALUES
             ('SpeedCompletionReason', ARRAY['all_players_terminal','deadline','forfeit','ready_timeout','operator_void','invitation_timeout','pre_start_cancelled']::text[]),
             ('MatchMutationKind', ARRAY['speed_ready','speed_guess','speed_forfeit']::text[])
         ), actual_enums AS (
           SELECT t.typname AS type_name,
                  array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
             FROM pg_type t
             JOIN pg_namespace n ON n.oid = t.typnamespace
             JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE n.nspname = current_schema()
              AND t.typtype = 'e'
              AND t.typname IN ('SpeedCompletionReason', 'MatchMutationKind')
            GROUP BY t.oid, t.typname
         ), enum_shape AS (
           SELECT count(a.type_name) = count(*) AND bool_and(a.labels = e.labels) AS ok
             FROM expected_enums e LEFT JOIN actual_enums a USING (type_name)
         ), index_shapes AS (
           SELECT tc.relname AS table_name, ic.relname AS index_name,
                  i.indisunique, i.indisprimary, i.indisvalid, i.indisready, am.amname AS access_method,
                  i.indnkeyatts, i.indnatts, i.indexprs IS NULL AS no_expressions,
                  i.indpred IS NULL AS not_partial,
                  ARRAY(SELECT option FROM unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(option, position) ORDER BY position) AS key_options,
                  ARRAY(
                    SELECT opn.nspname || '.' || opc.opcname
                      FROM unnest(i.indclass::oid[]) WITH ORDINALITY AS o(opclass_oid, position)
                      JOIN pg_opclass opc ON opc.oid = o.opclass_oid
                      JOIN pg_namespace opn ON opn.oid = opc.opcnamespace
                     ORDER BY position
                  ) AS operator_classes,
                  ARRAY(
                    SELECT CASE WHEN o.collation_oid = 0 THEN 'none' ELSE cn.nspname || '.' || c.collname END
                      FROM unnest(i.indcollation::oid[]) WITH ORDINALITY AS o(collation_oid, position)
                      LEFT JOIN pg_collation c ON c.oid = o.collation_oid
                      LEFT JOIN pg_namespace cn ON cn.oid = c.collnamespace
                     ORDER BY position
                  ) AS collations,
                  ARRAY(
                    SELECT a.attname
                      FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum, position)
                      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                     WHERE k.position <= i.indnkeyatts
                     ORDER BY k.position
                  ) AS key_columns,
                  ARRAY(
                    SELECT conjunct
                      FROM regexp_split_to_table(
                        regexp_replace(
                          regexp_replace(replace(COALESCE(pg_get_expr(i.indpred, i.indrelid, false), ''), '"', ''),
                            '::([A-Za-z0-9_]+\\.)?(RankedMode|MatchStatus)|::text', '', 'g'),
                          '[()[:space:]]', '', 'g'),
                        'AND') AS conjunct
                     ORDER BY conjunct
                  ) AS predicate_conjuncts
             FROM pg_index i
             JOIN pg_class tc ON tc.oid = i.indrelid
             JOIN pg_namespace tn ON tn.oid = tc.relnamespace
             JOIN pg_class ic ON ic.oid = i.indexrelid
             JOIN pg_namespace inode ON inode.oid = ic.relnamespace
             JOIN pg_am am ON am.oid = ic.relam
            WHERE tn.nspname = current_schema()
              AND inode.nspname = current_schema()
              AND tc.relkind IN ('r', 'p')
         ), mutation_unique_shape AS (
           SELECT count(*) = 1 AS ok FROM index_shapes
            WHERE table_name = 'MatchMutationRequest'
              AND indisunique AND NOT indisprimary AND indisvalid AND indisready AND access_method = 'btree'
              AND indnkeyatts = 3 AND indnatts = 3 AND no_expressions AND not_partial
              AND key_options = ARRAY[0,0,0]::smallint[]
              AND operator_classes = ARRAY['pg_catalog.text_ops','pg_catalog.enum_ops','pg_catalog.text_ops']::text[]
              AND collations = ARRAY['pg_catalog.default','none','pg_catalog.default']::text[]
              AND key_columns = ARRAY['participantId','kind','clientRequestId']::name[]
         ), due_index_shape AS (
           SELECT
             count(*) FILTER (WHERE index_name = 'speed_v2_invitation_due_idx'
               AND table_name = 'Match' AND NOT indisunique AND NOT indisprimary AND indisvalid AND indisready AND access_method = 'btree'
               AND indnkeyatts = 2 AND indnatts = 2 AND no_expressions AND NOT not_partial
               AND key_options = ARRAY[0,0]::smallint[]
               AND operator_classes = ARRAY['pg_catalog.timestamp_ops','pg_catalog.text_ops']::text[]
               AND collations = ARRAY['none','pg_catalog.default']::text[]
               AND key_columns = ARRAY['invitationExpiresAt','id']::name[]
               AND predicate_conjuncts = ARRAY['adjudicatedAtISNULL','rankedMode=''speed_1v1''','readyLifecycleVersion=''speed_ready_v2_first_ack_90s''','readyWindowStartedAtISNULL','status=''pending''']::text[]) = 1
             AND
             count(*) FILTER (WHERE index_name = 'speed_v2_ready_due_idx'
               AND table_name = 'Match' AND NOT indisunique AND NOT indisprimary AND indisvalid AND indisready AND access_method = 'btree'
               AND indnkeyatts = 2 AND indnatts = 2 AND no_expressions AND NOT not_partial
               AND key_options = ARRAY[0,0]::smallint[]
               AND operator_classes = ARRAY['pg_catalog.timestamp_ops','pg_catalog.text_ops']::text[]
               AND collations = ARRAY['none','pg_catalog.default']::text[]
               AND key_columns = ARRAY['readyDeadlineAt','id']::name[]
               AND predicate_conjuncts = ARRAY['adjudicatedAtISNULL','rankedMode=''speed_1v1''','readyLifecycleVersion=''speed_ready_v2_first_ack_90s''','readyWindowStartedAtISNOTNULL','status=''pending''']::text[]) = 1 AS ok
             FROM index_shapes
         )
         SELECT columns_shape.ok AS columns_ok,
                enum_shape.ok AS enums_ok,
                mutation_unique_shape.ok AS mutation_unique_ok,
                due_index_shape.ok AS indexes_ok
           FROM columns_shape, enum_shape, mutation_unique_shape, due_index_shape`,
      );
      const row = rows[0];
      if (!row?.columns_ok || !row.enums_ok || !row.mutation_unique_ok || !row.indexes_ok) {
        return { status: 'unavailable', checkedAt, latencyMs: Date.now() - startedAt, message: 'Speed ready lifecycle schema dependency is unavailable.' };
      }
      if (!includeActivation) {
        return { status: 'ok', checkedAt, latencyMs: Date.now() - startedAt, message: 'Speed persisted-row lifecycle schema is ready.' };
      }
      const activationRows = await this.client.$queryRawUnsafe<Array<{ schema_ok: boolean }>>(
        `WITH expected_columns(table_name,column_name,data_type,is_nullable,datetime_precision,column_default) AS (
           VALUES
             ('MatchmakingTicket','readyLifecycleVersion','text','YES',NULL::integer,NULL::text),
             ('SpeedLifecycleActivation','key','text','NO',NULL,NULL),
             ('SpeedLifecycleActivation','controlProtocol','text','NO',NULL,NULL),
             ('SpeedLifecycleActivation','phase','text','NO',NULL,NULL),
             ('SpeedLifecycleActivation','activeCreationVersion','text','YES',NULL,NULL),
             ('SpeedLifecycleActivation','generation','bigint','NO',NULL,NULL),
             ('SpeedLifecycleActivation','targetReleaseId','text','YES',NULL,NULL),
             ('SpeedLifecycleActivation','expectedReplicaCount','integer','YES',NULL,NULL),
             ('SpeedLifecycleActivation','transitionReason','text','YES',NULL,NULL),
             ('SpeedLifecycleActivation','updatedAt','timestamp without time zone','NO',3,'CURRENT_TIMESTAMP'),
             ('SpeedLifecycleActivation','createdAt','timestamp without time zone','NO',3,'CURRENT_TIMESTAMP'),
             ('SpeedLifecycleCapabilityLease','instanceBootId','text','NO',NULL,NULL),
             ('SpeedLifecycleCapabilityLease','serviceId','text','NO',NULL,NULL),
             ('SpeedLifecycleCapabilityLease','releaseId','text','NO',NULL,NULL),
             ('SpeedLifecycleCapabilityLease','controlProtocol','text','NO',NULL,NULL),
             ('SpeedLifecycleCapabilityLease','supportsV1','boolean','NO',NULL,NULL),
             ('SpeedLifecycleCapabilityLease','supportsV2','boolean','NO',NULL,NULL),
             ('SpeedLifecycleCapabilityLease','supportsLegacyReconcile','boolean','NO',NULL,NULL),
             ('SpeedLifecycleCapabilityLease','observedGeneration','bigint','YES',NULL,NULL),
             ('SpeedLifecycleCapabilityLease','startedAt','timestamp without time zone','NO',3,NULL),
             ('SpeedLifecycleCapabilityLease','lastSeenAt','timestamp without time zone','NO',3,NULL),
             ('SpeedLifecycleCapabilityLease','expiresAt','timestamp without time zone','NO',3,NULL)
         ), expected_constraints(name,digest) AS (
           VALUES
             ('Match_ready_lifecycle_check','b34ed180e462bcdbfdcb3eb7a5a13e9f'),
             ('MatchmakingTicket_ready_lifecycle_check','6c2828220b89bbd1867ad3aa38cc4e99'),
             ('SpeedLifecycleActivation_canonical_key_check','3d2a69ef97c7d07031b8b6cc26f1a332'),
             ('SpeedLifecycleActivation_generation_check','b9ae21524a6011959c0d1ed9706d5dab'),
             ('SpeedLifecycleActivation_phase_check','eb737035e4954db8112253f99b97df64'),
             ('SpeedLifecycleActivation_phase_version_check','8522bc0b93d7ce566206daf806c5bfa7'),
             ('SpeedLifecycleActivation_pkey','729d3ed6c85722f863da384d2313331e'),
             ('SpeedLifecycleActivation_protocol_check','8fb823a890083f8a721d65faab0ef2fd'),
             ('SpeedLifecycleActivation_replica_count_check','24c6ffa251c69949efddc23845a74b45'),
             ('SpeedLifecycleActivation_target_pair_check','25148aa77e1d188104340c619e8b88e7'),
             ('SpeedLifecycleCapabilityLease_generation_check','5f88f2fafa41b2ce7008398381dbee17'),
             ('SpeedLifecycleCapabilityLease_identity_check','6c2c91ae64adf2e22ccfd2545b7272ac'),
             ('SpeedLifecycleCapabilityLease_pkey','afc0bb0cfdfab272f2f9aba1c70bd52c'),
             ('SpeedLifecycleCapabilityLease_time_check','4da48159b67fa306086b26071f693245')
         ), actual_constraints AS (
           SELECT x.conname AS name, md5(pg_get_constraintdef(x.oid,true)) AS digest
             FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=current_schema() AND (
              c.relname IN ('SpeedLifecycleActivation','SpeedLifecycleCapabilityLease')
              OR x.conname IN ('MatchmakingTicket_ready_lifecycle_check','Match_ready_lifecycle_check'))
         ), expected_functions(name,digest) AS (
           VALUES
             ('wr_speed_creation_guard','7a01d1f3d613bb33b16fb01cab105e71'),
             ('wr_speed_activation_transition_guard','75c08be173f011ffa15e999f20256deb'),
             ('wr_speed_activation_truncate_guard','60de57bcc8762dd58ba320bdbb97c327')
         ), actual_functions AS (
           SELECT p.proname AS name, md5(p.prosrc) AS digest
             FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
            WHERE n.nspname=current_schema() AND p.proname LIKE 'wr_speed_%'
              AND NOT p.prosecdef AND l.lanname='plpgsql'
         ), expected_triggers(table_name,name,tgtype,function_name) AS (
           VALUES
             ('MatchmakingTicket','speed_ticket_creation_guard',7::smallint,'wr_speed_creation_guard'),
             ('Match','speed_match_creation_guard',7::smallint,'wr_speed_creation_guard'),
             ('SpeedLifecycleActivation','speed_activation_transition_guard',27::smallint,'wr_speed_activation_transition_guard'),
             ('SpeedLifecycleActivation','speed_activation_truncate_guard',34::smallint,'wr_speed_activation_truncate_guard')
         ), actual_triggers AS (
           SELECT c.relname AS table_name,t.tgname AS name,t.tgtype,p.proname AS function_name
             FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
            WHERE n.nspname=current_schema() AND pn.nspname=current_schema() AND NOT t.tgisinternal AND t.tgenabled='O'
              AND c.relname IN ('MatchmakingTicket','Match','SpeedLifecycleActivation')
         )
         SELECT
           (SELECT count(*)=2 FROM information_schema.tables
             WHERE table_schema=current_schema() AND table_type='BASE TABLE'
               AND table_name IN ('SpeedLifecycleActivation','SpeedLifecycleCapabilityLease'))
           AND NOT EXISTS (
             SELECT 1 FROM expected_columns e LEFT JOIN information_schema.columns c
               ON c.table_schema=current_schema() AND c.table_name=e.table_name AND c.column_name=e.column_name
              WHERE c.column_name IS NULL OR c.data_type<>e.data_type OR c.is_nullable<>e.is_nullable
                 OR c.datetime_precision IS DISTINCT FROM e.datetime_precision OR c.column_default IS DISTINCT FROM e.column_default)
           AND (SELECT count(*)=10 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='SpeedLifecycleActivation')
           AND (SELECT count(*)=11 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='SpeedLifecycleCapabilityLease')
           AND NOT EXISTS (SELECT 1 FROM expected_constraints e LEFT JOIN actual_constraints a USING(name) WHERE a.digest IS DISTINCT FROM e.digest)
           AND (SELECT count(*) FROM actual_constraints)=(SELECT count(*) FROM expected_constraints)
           AND NOT EXISTS (SELECT 1 FROM expected_functions e LEFT JOIN actual_functions a USING(name) WHERE a.digest IS DISTINCT FROM e.digest)
           AND (SELECT count(*) FROM actual_functions)=(SELECT count(*) FROM expected_functions)
           AND NOT EXISTS (SELECT 1 FROM expected_triggers e LEFT JOIN actual_triggers a USING(table_name,name,tgtype,function_name) WHERE a.name IS NULL)
           AND (SELECT count(*) FROM actual_triggers)=(SELECT count(*) FROM expected_triggers)
           AND (SELECT count(*)=1 FROM "SpeedLifecycleActivation"
             WHERE "key"='speed_1v1' AND "controlProtocol"='speed_lifecycle_activation_gate_v1'
               AND "generation">=1 AND (
                 ("phase"='v1_open' AND "activeCreationVersion"='speed_ready_v1_match_created_20s') OR
                 ("phase"='v2_open' AND "activeCreationVersion"='speed_ready_v2_first_ack_90s') OR
                 ("phase" IN ('closing_to_v2','closing_to_v1','disabled') AND "activeCreationVersion" IS NULL)))
           AND (SELECT count(*)=1 FROM pg_index i
             JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             JOIN pg_class x ON x.oid=i.indexrelid JOIN pg_am am ON am.oid=x.relam
             WHERE n.nspname=current_schema() AND c.relname='SpeedLifecycleCapabilityLease'
               AND x.relname='SpeedLifecycleCapabilityLease_releaseId_expiresAt_idx'
               AND i.indisvalid AND i.indisready AND NOT i.indisunique AND NOT i.indisprimary AND am.amname='btree'
               AND i.indnkeyatts=2 AND i.indnatts=2 AND i.indexprs IS NULL AND i.indpred IS NULL
               AND i.indoption[0]=0 AND i.indoption[1]=0
               AND ARRAY(SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ord)
                         JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum ORDER BY k.ord)=ARRAY['releaseId','expiresAt']::name[]
               AND ARRAY(SELECT opc.opcname FROM unnest(i.indclass::oid[]) WITH ORDINALITY k(opcoid,ord)
                         JOIN pg_opclass opc ON opc.oid=k.opcoid ORDER BY k.ord)=ARRAY['text_ops','timestamp_ops']::name[]
               AND ARRAY(SELECT opn.nspname::text||'.'||opc.opcname::text
                           FROM unnest(i.indclass::oid[]) WITH ORDINALITY k(opcoid,ord)
                           JOIN pg_opclass opc ON opc.oid=k.opcoid
                           JOIN pg_namespace opn ON opn.oid=opc.opcnamespace ORDER BY k.ord)
                   =ARRAY['pg_catalog.text_ops','pg_catalog.timestamp_ops']::text[]
               AND ARRAY(SELECT COALESCE(cn.nspname::text||'.'||coll.collname::text,'<noncollatable>')
                           FROM unnest(i.indcollation::oid[]) WITH ORDINALITY k(coll_oid,ord)
                           LEFT JOIN pg_collation coll ON coll.oid=k.coll_oid
                           LEFT JOIN pg_namespace cn ON cn.oid=coll.collnamespace ORDER BY k.ord)
                   =ARRAY['pg_catalog.default','<noncollatable>']::text[])
          AND (SELECT count(*)=1 FROM pg_index i
            JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=current_schema() AND c.relname='SpeedLifecycleCapabilityLease'
              AND i.indnkeyatts=2
              AND ARRAY(SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ord)
                        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum ORDER BY k.ord)=ARRAY['releaseId','expiresAt']::name[])
          AND (SELECT count(*)=1 FROM pg_index i
             JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
             JOIN pg_class x ON x.oid=i.indexrelid JOIN pg_am am ON am.oid=x.relam
             WHERE n.nspname=current_schema() AND c.relname='SpeedLifecycleCapabilityLease'
               AND x.relname='SpeedLifecycleCapabilityLease_controlProtocol_expiresAt_idx'
               AND i.indisvalid AND i.indisready AND NOT i.indisunique AND NOT i.indisprimary AND am.amname='btree'
               AND i.indnkeyatts=2 AND i.indnatts=2 AND i.indexprs IS NULL AND i.indpred IS NULL
               AND i.indoption[0]=0 AND i.indoption[1]=0
               AND ARRAY(SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ord)
                         JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum ORDER BY k.ord)=ARRAY['controlProtocol','expiresAt']::name[]
               AND ARRAY(SELECT opc.opcname FROM unnest(i.indclass::oid[]) WITH ORDINALITY k(opcoid,ord)
                         JOIN pg_opclass opc ON opc.oid=k.opcoid ORDER BY k.ord)=ARRAY['text_ops','timestamp_ops']::name[]
               AND ARRAY(SELECT opn.nspname::text||'.'||opc.opcname::text
                           FROM unnest(i.indclass::oid[]) WITH ORDINALITY k(opcoid,ord)
                           JOIN pg_opclass opc ON opc.oid=k.opcoid
                           JOIN pg_namespace opn ON opn.oid=opc.opcnamespace ORDER BY k.ord)
                   =ARRAY['pg_catalog.text_ops','pg_catalog.timestamp_ops']::text[]
               AND ARRAY(SELECT COALESCE(cn.nspname::text||'.'||coll.collname::text,'<noncollatable>')
                           FROM unnest(i.indcollation::oid[]) WITH ORDINALITY k(coll_oid,ord)
                           LEFT JOIN pg_collation coll ON coll.oid=k.coll_oid
                           LEFT JOIN pg_namespace cn ON cn.oid=coll.collnamespace ORDER BY k.ord)
                   =ARRAY['pg_catalog.default','<noncollatable>']::text[])
          AND (SELECT count(*)=1 FROM pg_index i
            JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=current_schema() AND c.relname='SpeedLifecycleCapabilityLease'
              AND i.indnkeyatts=2
              AND ARRAY(SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ord)
                        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum ORDER BY k.ord)=ARRAY['controlProtocol','expiresAt']::name[])
          AS schema_ok`,
      );
      if (!activationRows[0]?.schema_ok) {
        return { status: 'unavailable', checkedAt, latencyMs: Date.now() - startedAt, message: 'Speed ready lifecycle schema dependency is unavailable.' };
      }
      return { status: 'ok', checkedAt, latencyMs: Date.now() - startedAt, message: 'Speed ready lifecycle and activation schema is ready.' };
    } catch (error) {
      void error;
      return { status: 'unavailable', checkedAt, latencyMs: Date.now() - startedAt, message: 'Speed ready lifecycle schema dependency is unavailable.' };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect?.();
  }
}
