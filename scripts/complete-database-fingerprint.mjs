import { createHash } from 'node:crypto';

/**
 * The application-table manifest is deliberately explicit. A Prisma model must be
 * added here in the same change that adds it to schema.prisma; production
 * preflight rejects either a missing or an unexpected application table.
 */
export const APPLICATION_MODEL_TABLES = Object.freeze([
  ['UserAccount', 'UserAccount'],
  ['PasswordCredential', 'PasswordCredential'],
  ['AccountSession', 'AccountSession'],
  ['AuthRateLimitBucket', 'AuthRateLimitBucket'],
  ['UserProfile', 'UserProfile'],
  ['ConsentRecord', 'ConsentRecord'],
  ['DictionaryRelease', 'DictionaryRelease'],
  ['DictionaryWord', 'DictionaryWord'],
  ['Lobby', 'Lobby'],
  ['Match', 'Match'],
  ['MatchRound', 'MatchRound'],
  ['MatchParticipant', 'MatchParticipant'],
  ['MatchMutationRequest', 'MatchMutationRequest'],
  ['GuessAttempt', 'GuessAttempt'],
  ['ScoreBreakdown', 'ScoreBreakdown'],
  ['MatchReport', 'MatchReport'],
  ['RatingProfile', 'RatingProfile'],
  ['RatingEvent', 'RatingEvent'],
  ['LeaderboardSnapshot', 'LeaderboardSnapshot'],
  ['MatchmakingTicket', 'MatchmakingTicket'],
  ['SpeedLifecycleActivation', 'SpeedLifecycleActivation'],
  ['SpeedLifecycleCapabilityLease', 'SpeedLifecycleCapabilityLease'],
  ['SpeedLifecycleActivationAudit', 'SpeedLifecycleActivationAudit'],
  ['AnalyticsEvent', 'AnalyticsEvent'],
  ['AuditLog', 'AuditLog'],
].map((entry) => Object.freeze(entry)));

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

export const APPLICATION_MANIFEST_DIGEST = sha256(canonical(APPLICATION_MODEL_TABLES));

const TABLES_SQL = `SELECT c.relname AS table_name
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = current_schema()
  AND c.relkind IN ('r','p')
  AND c.relname <> '_prisma_migrations'
ORDER BY c.relname`;

// Every current Prisma scalar maps to a deterministic JSON scalar. Arrays,
// ranges, composites, domains and extension/user-defined non-enum values fail
// closed rather than silently acquiring unstable serialization semantics.
const TYPES_SQL = `SELECT c.relname AS table_name, a.attname AS column_name,
       t.typname AS type_name, t.typtype AS type_kind, t.typcategory AS type_category,
       a.attnotnull AS not_null
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
WHERE n.nspname = current_schema()
  AND c.relkind IN ('r','p')
  AND c.relname <> '_prisma_migrations'
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY c.relname, a.attnum`;

function rows(value) {
  if (!Array.isArray(value)) throw new Error('complete_fingerprint_query_invalid');
  return value;
}

function expectedType(field) {
  if (field.kind === 'enum') return field.type;
  const native = field.nativeType?.[0];
  if (native === 'Text') return 'text';
  if (native === 'Char') return 'bpchar';
  if (native === 'VarChar') return 'varchar';
  if (native === 'Uuid') return 'uuid';
  if (native === 'Timestamptz') return 'timestamptz';
  return { Boolean: 'bool', BigInt: 'int8', DateTime: 'timestamp', Float: 'float8', Int: 'int4', Json: 'jsonb', String: 'text' }[field.type];
}

function prismaCatalog(prismaModels) {
  if (!Array.isArray(prismaModels)) throw new Error('complete_fingerprint_prisma_manifest_invalid');
  const observedModels = prismaModels.map((model) => [model?.name, model?.dbName ?? model?.name]);
  if (canonical(observedModels) !== canonical(APPLICATION_MODEL_TABLES)) throw new Error('complete_fingerprint_prisma_manifest_drift');
  const expected = new Map();
  for (const model of prismaModels) {
    for (const field of model.fields ?? []) {
      if (field.kind === 'object') continue;
      const typeName = expectedType(field);
      if (!typeName) throw new Error('complete_fingerprint_unsupported_prisma_type');
      const identity = `${model.dbName ?? model.name}\0${field.dbName ?? field.name}`;
      if (expected.has(identity)) throw new Error('complete_fingerprint_prisma_manifest_invalid');
      expected.set(identity, { typeName, notNull: field.isRequired === true });
    }
  }
  if (expected.size === 0) throw new Error('complete_fingerprint_prisma_manifest_invalid');
  return expected;
}

function assertCatalog(tableRows, typeRows, prismaModels) {
  const expected = APPLICATION_MODEL_TABLES.map(([, table]) => table).sort();
  const observed = rows(tableRows).map((row) => row?.table_name);
  if (observed.some((name) => typeof name !== 'string') || canonical(observed) !== canonical(expected)) {
    throw new Error('complete_fingerprint_manifest_drift');
  }
  const expectedSet = new Set(expected);
  const expectedColumns = prismaCatalog(prismaModels);
  const seen = new Set();
  for (const row of rows(typeRows)) {
    if (!row || !expectedSet.has(row.table_name) || typeof row.column_name !== 'string' || typeof row.type_name !== 'string') {
      throw new Error('complete_fingerprint_schema_drift');
    }
    const supportedBuiltin = row.type_kind === 'b' && new Set([
      'bool', 'bpchar', 'float8', 'int4', 'int8', 'jsonb', 'text',
      'timestamp', 'timestamptz', 'uuid', 'varchar',
    ]).has(row.type_name);
    const supportedEnum = row.type_kind === 'e' && row.type_category === 'E';
    if (!supportedBuiltin && !supportedEnum) throw new Error('complete_fingerprint_unsupported_type');
    const identity = `${row.table_name}\0${row.column_name}`;
    if (seen.has(identity)) throw new Error('complete_fingerprint_schema_drift');
    const expectedColumn = expectedColumns.get(identity);
    if (!expectedColumn || expectedColumn.typeName !== row.type_name || expectedColumn.notNull !== row.not_null) {
      throw new Error('complete_fingerprint_schema_drift');
    }
    seen.add(identity);
  }
  if (seen.size !== expectedColumns.size) throw new Error('complete_fingerprint_schema_drift');
}

/**
 * Produces only counts and nested digests. Row JSON (including dictionary words,
 * account data and auth material) is hashed inside PostgreSQL and never crosses
 * the database adapter boundary or appears in preflight evidence/errors.
 */
export async function completeDatabaseFingerprint(tx, prismaModels) {
  let tableRows;
  let typeRows;
  try {
    [tableRows, typeRows] = await Promise.all([
      tx.$queryRawUnsafe(TABLES_SQL),
      tx.$queryRawUnsafe(TYPES_SQL),
    ]);
    assertCatalog(tableRows, typeRows, prismaModels);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('complete_fingerprint_')) throw error;
    throw new Error('complete_fingerprint_query_failed');
  }

  const models = [];
  try {
    // Sequential reads make query attribution deterministic and avoid exhausting
    // connections when the adapter is run through a constrained hosted proxy.
    for (const [model, table] of APPLICATION_MODEL_TABLES) {
      const sql = `SELECT count(*)::text AS row_count,
        encode(sha256(convert_to(coalesce(string_agg(row_digest, '' ORDER BY row_digest), ''), 'UTF8')), 'hex') AS content_digest
        FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') AS row_digest FROM ${quote(table)} t) rows`;
      const result = rows(await tx.$queryRawUnsafe(sql));
      const row = result[0];
      if (result.length !== 1 || !row || !/^(0|[1-9][0-9]*)$/u.test(String(row.row_count)) || !/^[a-f0-9]{64}$/u.test(String(row.content_digest))) {
        throw new Error('complete_fingerprint_query_invalid');
      }
      const count = Number(row.row_count);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('complete_fingerprint_count_unsafe');
      // Re-hash the database-side digest with a domain separator. Only this
      // privacy-safe SHA-256 value leaves this module.
      models.push({ model, table, count, digest: sha256(`wordle-preflight-table-v1\0${table}\0${row.content_digest}`) });
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('complete_fingerprint_')) throw error;
    throw new Error('complete_fingerprint_query_failed');
  }
  const totalCount = models.reduce((total, model) => total + model.count, 0);
  if (!Number.isSafeInteger(totalCount)) throw new Error('complete_fingerprint_count_unsafe');
  return Object.freeze({
    schemaVersion: 1,
    manifestDigest: APPLICATION_MANIFEST_DIGEST,
    modelCount: models.length,
    totalCount,
    stateDigest: sha256(canonical(models)),
    models: models.map((model) => Object.freeze(model)),
  });
}
