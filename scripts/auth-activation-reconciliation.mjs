import { createHash, createHmac } from 'node:crypto';
import { receiptFor } from './auth-activation-preflight-core.mjs';

const SHARED_GROUPS = Object.freeze({
  standard: ['Lobby'],
  speed: ['SpeedLifecycleActivation', 'SpeedLifecycleCapabilityLease', 'SpeedLifecycleActivationAudit'],
  matchmaking: ['MatchmakingTicket'],
  match: ['Match', 'MatchParticipant'],
  gameplay: ['MatchRound', 'GuessAttempt', 'ScoreBreakdown', 'MatchReport'],
  mutation: ['MatchMutationRequest'],
  rating: ['RatingProfile', 'RatingEvent', 'LeaderboardSnapshot'],
  event: ['AnalyticsEvent', 'AuditLog'],
  catalog: ['DictionaryRelease', 'DictionaryWord'],
});
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const number = (value) => Number(typeof value === 'bigint' ? value : value ?? 0);
const identityFingerprint = (runId, email, handle, displayName) => createHash('sha256')
  .update('auth-smoke-account-v2\0').update(runId).update('\0').update(email.trim().toLowerCase())
  .update('\0').update(handle).update('\0').update(displayName).digest('hex');
const rateDigest = (key, action, value) => createHmac('sha256', key).update(action).update('\0').update(value).digest('hex');

async function tableState(tx, names) {
  const rows = [];
  for (const name of names) {
    const [row] = await tx.$queryRawUnsafe(`SELECT count(*)::bigint AS count, md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${quote(name)} t`);
    rows.push({ table: name, count: number(row?.count), fingerprint: row?.fingerprint ?? '' });
  }
  return { count: rows.reduce((sum, row) => sum + row.count, 0), fingerprint: receiptFor(rows) };
}

async function nonTargetAuthState(tx, userId) {
  const tables = [
    ['UserAccount', 'id'],
    ['PasswordCredential', 'userId'],
    ['UserProfile', 'userId'],
    ['ConsentRecord', 'userId'],
  ];
  const rows = [];
  for (const [table, column] of tables) {
    const [row] = await tx.$queryRawUnsafe(
      `SELECT count(*)::bigint AS count, md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM ${quote(table)} t WHERE ($1::text IS NULL OR ${quote(column)}<>$1::text)`,
      userId ?? null,
    );
    rows.push({ table, count: number(row?.count), fingerprint: row?.fingerprint ?? '' });
  }
  return { count: rows.reduce((sum, row) => sum + row.count, 0), fingerprint: receiptFor(rows) };
}

async function nonTargetRateLimitState(tx, scopedRateKeys) {
  const scoped = scopedRateKeys.map((_, index) => `("action"=$${index * 2 + 1} AND "keyHash"=$${index * 2 + 2})`).join(' OR ');
  const [row] = await tx.$queryRawUnsafe(
    `SELECT count(*)::bigint AS count, md5(coalesce(string_agg(to_jsonb(b)::text, E'\\n' ORDER BY to_jsonb(b)::text),'')) AS fingerprint FROM "AuthRateLimitBucket" b WHERE NOT (${scoped})`,
    ...scopedRateKeys.flatMap(({ action, keyHash }) => [action, keyHash]),
  );
  return {
    count: number(row?.count),
    fingerprint: createHash('sha256').update(row?.fingerprint ?? '').digest('hex'),
  };
}

/** Shared by the production CLI and the disposable Nest/PostgreSQL smoke. */
export function createAuthSmokeReconciliation({ db, secrets, rateLimitKey, clientIp }) {
  if (!db?.$transaction || !Buffer.isBuffer(rateLimitKey) || rateLimitKey.length < 32 || typeof clientIp !== 'string' || clientIp.length < 3) throw new Error('reconciliation_configuration_invalid');
  const email = secrets.email.trim().toLowerCase();
  const at = email.indexOf('@');
  const local = email.slice(0, at);
  const unknownEmail = `${local[0] === 'z' ? 'y' : 'z'}${local.slice(1)}${email.slice(at)}`;
  const scopedRateKeys = [
    ['register_email', email], ['register_ip', clientIp],
    ['login_email', email], ['login_email', unknownEmail], ['login_ip', clientIp],
  ].map(([action, value]) => ({ action, keyHash: rateDigest(rateLimitKey, action, value) }));
  let baselineGroups;
  return { async withReadOnlyTransaction(work) {
    await db.$transaction(async (tx) => {
      let isolated = false;
      const query = async (sql, binding) => {
        if (sql === 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY') { await tx.$executeRawUnsafe(sql); isolated = true; return true; }
        if (!isolated) throw new Error('read_only_transaction_required');
        if (sql === 'SHOW transaction_read_only') { const [row] = await tx.$queryRawUnsafe(sql); return { transactionReadOnly: row?.transaction_read_only }; }
        if (sql !== 'SELECT auth_activation_smoke_reconciliation_v2($1,$2)') throw new Error('sql_not_allowlisted');
        const account = await tx.userAccount.findUnique({ where: { email }, select: { id: true, email: true, displayName: true, profile: { select: { publicHandle: true } } } });
        const userId = account?.id;
        const [credentialCount, consentCount, sessions, rateRows, nonTargetSessions, nonTargetAuth, nonTargetRateLimit, ...states] = await Promise.all([
          userId ? tx.passwordCredential.count({ where: { userId } }) : 0,
          userId ? tx.consentRecord.count({ where: { userId } }) : 0,
          userId ? tx.accountSession.findMany({ where: { userId }, select: { revokedAt: true, expiresAt: true } }) : [],
          tx.authRateLimitBucket.findMany({ where: { OR: scopedRateKeys }, select: { action: true, keyHash: true, attemptCount: true, blockedUntil: true } }),
          tx.$queryRawUnsafe(`SELECT count(*)::bigint AS count, md5(coalesce(string_agg(to_jsonb(s)::text, E'\\n' ORDER BY to_jsonb(s)::text),'')) AS fingerprint FROM "AccountSession" s WHERE ($1::text IS NULL OR s."userId"<>$1::text)`, userId ?? null),
          nonTargetAuthState(tx, userId),
          nonTargetRateLimitState(tx, scopedRateKeys),
          ...Object.values(SHARED_GROUPS).map((tables) => tableState(tx, tables)),
        ]);
        const groups = Object.fromEntries(Object.keys(SHARED_GROUPS).map((key, index) => [key, states[index]]));
        if (!baselineGroups) baselineGroups = structuredClone(groups);
        const delta = (key) => groups[key].count - baselineGroups[key].count;
        const unchanged = (key) => groups[key].fingerprint === baselineGroups[key].fingerprint;
        const now = Date.now();
        const terminal = sessions.filter((session) => session.revokedAt !== null || session.expiresAt.getTime() <= now).length;
        const rates = (prefix) => rateRows.filter((row) => row.action.startsWith(prefix));
        const register = rates('register_'), login = rates('login_');
        const nonTarget = nonTargetSessions[0];
        return {
          accountCount: account ? 1 : 0, profileCount: account?.profile ? 1 : 0, credentialCount, consentCount,
          sessionCount: sessions.length, terminalSessionCount: terminal, activeSessionCount: sessions.length - terminal,
          accountIdentityFingerprint: account ? identityFingerprint(binding.runId, account.email, account.profile.publicHandle, account.displayName) : '0'.repeat(64),
          nonTargetSessionCount: number(nonTarget?.count), nonTargetSessionFingerprint: createHash('sha256').update(nonTarget?.fingerprint ?? '').digest('hex'),
          nonTargetAuthCount: nonTargetAuth.count, nonTargetAuthFingerprint: nonTargetAuth.fingerprint,
          nonTargetRateLimitCount: nonTargetRateLimit.count, nonTargetRateLimitFingerprint: nonTargetRateLimit.fingerprint,
          registerAttempts: register.reduce((sum, row) => sum + row.attemptCount, 0), loginAttempts: login.reduce((sum, row) => sum + row.attemptCount, 0),
          registerBucketCount: register.length, loginBucketCount: login.length, blockedBucketCount: rateRows.filter((row) => row.blockedUntil && row.blockedUntil.getTime() > now).length,
          lobbyWriteCount: delta('standard'), speedWriteCount: delta('speed'), ticketWriteCount: delta('matchmaking'), matchWriteCount: delta('match'), gameplayWriteCount: delta('gameplay'), mutationWriteCount: delta('mutation'), ratingWriteCount: delta('rating'), eventWriteCount: delta('event'),
          sharedStateFingerprint: receiptFor(Object.keys(SHARED_GROUPS).filter((key) => key !== 'catalog').map((key) => ({ key, fingerprint: groups[key].fingerprint }))),
          sharedStateUnchanged: Object.keys(SHARED_GROUPS).filter((key) => key !== 'catalog').every(unchanged),
          catalogFingerprint: groups.catalog.fingerprint,
        };
      };
      await work(query);
    }, { timeout: 30_000 });
  } };
}

export { SHARED_GROUPS, identityFingerprint };
