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

// A count pass over every table happens before any row hashing. Production never
// hashes a table above this fixed ceiling. Tests may only lower the ceiling.
export const FINGERPRINT_MAX_TABLE_ROWS = 10_000_000;
// Each PostgreSQL string_agg is at most 4,096 fixed-width (64 byte) row digests.
export const FINGERPRINT_CHUNK_ROWS = 4_096;

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

const TYPES_SQL = `SELECT c.relname AS table_name, a.attname AS column_name,
       t.typname AS type_name, t.typtype AS type_kind, t.typcategory AS type_category,
       a.atttypmod::text AS type_modifier, pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
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

const ENUMS_SQL = `SELECT t.typname AS enum_name, e.enumlabel AS enum_label
FROM pg_catalog.pg_type t
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname = current_schema()
ORDER BY t.typname, e.enumsortorder`;

function rows(value) {
  if (!Array.isArray(value)) throw new Error('complete_fingerprint_query_invalid');
  return value;
}

const integerArgument = (args, index, minimum, maximum) => {
  const value = args[index];
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) throw new Error('complete_fingerprint_prisma_manifest_invalid');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error('complete_fingerprint_prisma_manifest_invalid');
  return number;
};

function scalarType(field) {
  const native = field.nativeType;
  if (native !== null && native !== undefined) {
    if (!Array.isArray(native) || typeof native[0] !== 'string' || !Array.isArray(native[1])) throw new Error('complete_fingerprint_prisma_manifest_invalid');
    const [name, args] = native;
    const exactArguments = (count) => {
      if (args.length !== count) throw new Error('complete_fingerprint_prisma_manifest_invalid');
    };
    if (name === 'Text') { exactArguments(0); return ['text', 'text', -1]; }
    if (name === 'Uuid') { exactArguments(0); return ['uuid', 'uuid', -1]; }
    if (name === 'JsonB') { exactArguments(0); return ['jsonb', 'jsonb', -1]; }
    if (name === 'Json') { exactArguments(0); return ['json', 'json', -1]; }
    if (name === 'ByteA') { exactArguments(0); return ['bytea', 'bytea', -1]; }
    if (name === 'VarChar' || name === 'Char') {
      exactArguments(1);
      const length = integerArgument(args, 0, 1, 10_485_760);
      return name === 'VarChar' ? ['varchar', `character varying(${length})`, length + 4] : ['bpchar', `character(${length})`, length + 4];
    }
    if (name === 'Timestamptz' || name === 'Timestamp' || name === 'Time') {
      exactArguments(1);
      const precision = integerArgument(args, 0, 0, 6);
      // PostgreSQL's omitted temporal typmod is exactly its maximum precision
      // (6), and existing migrations use that canonical equivalent spelling.
      const suffix = precision === 6 ? '' : `(${precision})`;
      const formatted = name === 'Timestamptz' ? `timestamp${suffix} with time zone` : name === 'Timestamp' ? `timestamp${suffix} without time zone` : `time${suffix} without time zone`;
      return [name === 'Timestamptz' ? 'timestamptz' : name === 'Timestamp' ? 'timestamp' : 'time', formatted, precision === 6 ? -1 : precision];
    }
    if (name === 'Decimal') {
      exactArguments(2);
      const precision = integerArgument(args, 0, 1, 1_000);
      const scale = integerArgument(args, 1, 0, precision);
      return ['numeric', `numeric(${precision},${scale})`, ((precision << 16) | scale) + 4];
    }
    const noArgument = {
      Boolean: ['bool', 'boolean', -1], SmallInt: ['int2', 'smallint', -1], Integer: ['int4', 'integer', -1],
      BigInt: ['int8', 'bigint', -1], Real: ['float4', 'real', -1], DoublePrecision: ['float8', 'double precision', -1],
      Date: ['date', 'date', -1], Xml: ['xml', 'xml', -1], Money: ['money', 'money', -1], Inet: ['inet', 'inet', -1], Oid: ['oid', 'oid', -1],
    }[name];
    if (noArgument && args.length === 0) return noArgument;
    throw new Error('complete_fingerprint_unsupported_prisma_type');
  }
  const defaults = {
    Boolean: ['bool', 'boolean', -1], BigInt: ['int8', 'bigint', -1], Bytes: ['bytea', 'bytea', -1],
    DateTime: ['timestamp', 'timestamp(3) without time zone', 3], Decimal: ['numeric', 'numeric(65,30)', ((65 << 16) | 30) + 4],
    Float: ['float8', 'double precision', -1], Int: ['int4', 'integer', -1], Json: ['jsonb', 'jsonb', -1], String: ['text', 'text', -1],
  };
  return defaults[field.type];
}

function prismaCatalog(datamodel) {
  if (!datamodel || !Array.isArray(datamodel.models) || !Array.isArray(datamodel.enums)) throw new Error('complete_fingerprint_prisma_manifest_invalid');
  const observedModels = datamodel.models.map((model) => [model?.name, model?.dbName ?? model?.name]);
  if (canonical(observedModels) !== canonical(APPLICATION_MODEL_TABLES)) throw new Error('complete_fingerprint_prisma_manifest_drift');
  const expectedEnums = new Map();
  for (const item of datamodel.enums) {
    const enumName = item?.dbName ?? item?.name;
    const labels = item?.values?.map((value) => value?.dbName ?? value?.name);
    if (typeof enumName !== 'string' || !Array.isArray(labels) || labels.some((label) => typeof label !== 'string') || expectedEnums.has(enumName)) throw new Error('complete_fingerprint_prisma_manifest_invalid');
    expectedEnums.set(enumName, labels);
  }
  const expected = new Map();
  for (const model of datamodel.models) {
    for (const field of model.fields ?? []) {
      if (field.kind === 'object') continue;
      let identity;
      if (field.kind === 'enum') {
        const enumDefinition = datamodel.enums.find((item) => item.name === field.type);
        const enumName = enumDefinition?.dbName ?? enumDefinition?.name;
        if (!enumName || !expectedEnums.has(enumName)) throw new Error('complete_fingerprint_prisma_manifest_invalid');
        identity = [enumName, quote(enumName), -1];
      } else identity = scalarType(field);
      if (!identity) throw new Error('complete_fingerprint_unsupported_prisma_type');
      let [typeName, formattedType, typeModifier] = identity;
      if (field.isList === true) {
        typeName = `_${typeName}`;
        formattedType = `${formattedType}[]`;
      }
      const columnIdentity = `${model.dbName ?? model.name}\0${field.dbName ?? field.name}`;
      if (expected.has(columnIdentity)) throw new Error('complete_fingerprint_prisma_manifest_invalid');
      expected.set(columnIdentity, { typeName, formattedType, typeModifier, notNull: field.isRequired === true });
    }
  }
  if (expected.size === 0) throw new Error('complete_fingerprint_prisma_manifest_invalid');
  return { columns: expected, enums: expectedEnums };
}

function assertCatalog(tableRows, typeRows, enumRows, datamodel) {
  const expectedTables = APPLICATION_MODEL_TABLES.map(([, table]) => table).sort();
  const observed = rows(tableRows).map((row) => row?.table_name);
  if (observed.some((name) => typeof name !== 'string') || canonical(observed) !== canonical(expectedTables)) throw new Error('complete_fingerprint_manifest_drift');
  const expectedSet = new Set(expectedTables);
  const catalog = prismaCatalog(datamodel);
  const seen = new Set();
  for (const row of rows(typeRows)) {
    if (!row || !expectedSet.has(row.table_name) || typeof row.column_name !== 'string' || typeof row.type_name !== 'string' || typeof row.formatted_type !== 'string' || !/^-?[0-9]+$/u.test(String(row.type_modifier))) throw new Error('complete_fingerprint_schema_drift');
    const columnIdentity = `${row.table_name}\0${row.column_name}`;
    if (seen.has(columnIdentity)) throw new Error('complete_fingerprint_schema_drift');
    const expected = catalog.columns.get(columnIdentity);
    if (!expected || expected.typeName !== row.type_name || expected.formattedType !== row.formatted_type || expected.typeModifier !== Number(row.type_modifier) || expected.notNull !== row.not_null) throw new Error('complete_fingerprint_schema_drift');
    seen.add(columnIdentity);
  }
  if (seen.size !== catalog.columns.size) throw new Error('complete_fingerprint_schema_drift');

  const observedEnums = new Map();
  for (const row of rows(enumRows)) {
    if (!row || typeof row.enum_name !== 'string' || typeof row.enum_label !== 'string') throw new Error('complete_fingerprint_schema_drift');
    const labels = observedEnums.get(row.enum_name) ?? [];
    labels.push(row.enum_label);
    observedEnums.set(row.enum_name, labels);
  }
  if (canonical(Object.fromEntries(observedEnums)) !== canonical(Object.fromEntries(catalog.enums))) throw new Error('complete_fingerprint_schema_drift');
}

function validatedLimit(options) {
  const limit = options?.maxTableRows ?? FINGERPRINT_MAX_TABLE_ROWS;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > FINGERPRINT_MAX_TABLE_ROWS) throw new Error('complete_fingerprint_limit_invalid');
  return limit;
}

/**
 * Produces only counts and nested digests. Row JSON (including dictionary words,
 * account data and auth material) is hashed inside PostgreSQL and never crosses
 * the database adapter boundary or appears in preflight evidence/errors.
 *
 * Aggregation is bounded: at most FINGERPRINT_CHUNK_ROWS row hashes enter any
 * string_agg, and at most ceil(FINGERPRINT_MAX_TABLE_ROWS / chunk size) 32-byte
 * chunk hashes enter the incremental final hash. The fixed production cardinality
 * ceiling is checked for every table before any row is serialized or hashed.
 */
export async function completeDatabaseFingerprint(tx, datamodel, options) {
  const maxTableRows = validatedLimit(options);
  let tableRows;
  let typeRows;
  let enumRows;
  try {
    [tableRows, typeRows, enumRows] = await Promise.all([
      tx.$queryRawUnsafe(TABLES_SQL), tx.$queryRawUnsafe(TYPES_SQL), tx.$queryRawUnsafe(ENUMS_SQL),
    ]);
    assertCatalog(tableRows, typeRows, enumRows, datamodel);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('complete_fingerprint_')) throw error;
    throw new Error('complete_fingerprint_query_failed');
  }

  const counts = new Map();
  try {
    // Complete count pass first: an oversized table fails before row JSON hashing.
    for (const [, table] of APPLICATION_MODEL_TABLES) {
      const result = rows(await tx.$queryRawUnsafe(`SELECT count(*)::text AS row_count FROM ${quote(table)}`));
      const text = result[0]?.row_count;
      if (result.length !== 1 || !/^(0|[1-9][0-9]*)$/u.test(String(text))) throw new Error('complete_fingerprint_query_invalid');
      const count = Number(text);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('complete_fingerprint_count_unsafe');
      if (count > maxTableRows) throw new Error('complete_fingerprint_table_cardinality_exceeded');
      counts.set(table, count);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('complete_fingerprint_')) throw error;
    throw new Error('complete_fingerprint_query_failed');
  }

  const models = [];
  try {
    for (const [model, table] of APPLICATION_MODEL_TABLES) {
      const sql = `WITH row_hashes AS (
          SELECT encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') AS row_digest FROM ${quote(table)} t
        ), numbered AS (
          SELECT row_digest, row_number() OVER (ORDER BY row_digest) - 1 AS row_number FROM row_hashes
        )
        SELECT (row_number / ${FINGERPRINT_CHUNK_ROWS})::text AS chunk_index,
          count(*)::text AS chunk_row_count,
          encode(sha256(convert_to(string_agg(row_digest, '' ORDER BY row_digest), 'UTF8')), 'hex') AS chunk_digest
        FROM numbered GROUP BY row_number / ${FINGERPRINT_CHUNK_ROWS} ORDER BY row_number / ${FINGERPRINT_CHUNK_ROWS}`;
      const chunks = rows(await tx.$queryRawUnsafe(sql));
      const count = counts.get(table);
      const expectedChunks = Math.ceil(count / FINGERPRINT_CHUNK_ROWS);
      if (chunks.length !== expectedChunks) throw new Error('complete_fingerprint_query_invalid');
      const finalHash = createHash('sha256');
      finalHash.update(`wordle-preflight-table-v2\0${table}\0${count}\0`);
      let rowsSeen = 0;
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        if (String(chunk?.chunk_index) !== String(index) || !/^(0|[1-9][0-9]*)$/u.test(String(chunk?.chunk_row_count)) || !/^[a-f0-9]{64}$/u.test(String(chunk?.chunk_digest))) throw new Error('complete_fingerprint_query_invalid');
        const chunkCount = Number(chunk.chunk_row_count);
        if (!Number.isSafeInteger(chunkCount) || chunkCount < 1 || chunkCount > FINGERPRINT_CHUNK_ROWS) throw new Error('complete_fingerprint_query_invalid');
        rowsSeen += chunkCount;
        finalHash.update(Buffer.from(chunk.chunk_digest, 'hex'));
      }
      if (rowsSeen !== count) throw new Error('complete_fingerprint_query_invalid');
      models.push({ model, table, count, digest: finalHash.digest('hex') });
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
