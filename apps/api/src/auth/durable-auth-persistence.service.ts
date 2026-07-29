import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { canonicalizeEmail, normalizeDisplayName, normalizeHandle, validatePassword } from './auth-input.js';
import { createDummyPasswordHash, hashPassword, parsePasswordHash, verifyPassword } from './password-crypto.js';
import { digestSessionToken, generateSessionToken } from './session-token.js';
import { PostgresAuthRateLimiter } from './auth-rate-limiter.js';

type RegisterInput = { email: string; password: string; handle: string; displayName: string };
type LoginInput = { email: string; password: string };
export type DurableSessionResult = { token: string; session: { id: string; userId: string; createdAt: Date; expiresAt: Date } };
export class AuthUnavailableError extends Error { readonly code = 'auth_unavailable'; constructor() { super('Durable authentication is unavailable.'); } }
export class RegistrationUnavailableError extends Error { readonly code = 'registration_unavailable'; constructor() { super('Registration unavailable.'); } }
export class InvalidCredentialsError extends Error { readonly code = 'invalid_credentials'; constructor() { super('Invalid credentials.'); } }
export type DurableAuthOptions = { enabled: boolean; rateLimitKey?: Buffer; now?: () => Date; sessionTtlMs?: number; lastSeenIntervalMs?: number; cryptoObserver?: (event: 'dummy_hash' | 'verify') => void };

export class DurableAuthPersistenceService {
  private readonly now: () => Date;
  private readonly ttl: number;
  private readonly lastSeenInterval: number;
  private readonly limiter?: PostgresAuthRateLimiter;
  private readonly dummyHash?: Promise<string>;
  constructor(private readonly db: PrismaClient, private readonly options: DurableAuthOptions) {
    this.now = options.now ?? (() => new Date());
    this.ttl = options.sessionTtlMs ?? 2_592_000_000;
    this.lastSeenInterval = options.lastSeenIntervalMs ?? 900_000;
    if (!Number.isSafeInteger(this.ttl) || this.ttl < 3_600_000 || this.ttl > 2_592_000_000) throw new Error('sessionTtlMs must be an integer from 1 hour through 30 days');
    if (!Number.isSafeInteger(this.lastSeenInterval) || this.lastSeenInterval < 300_000 || this.lastSeenInterval > this.ttl) throw new Error('lastSeenIntervalMs must be an integer from 5 minutes through sessionTtlMs');
    if (options.enabled) {
      if (!options.rateLimitKey) throw new Error('AUTH_RATE_LIMIT_KEY is required when durable auth is enabled');
      this.limiter = new PostgresAuthRateLimiter(db, options.rateLimitKey, this.now);
      this.dummyHash = createDummyPasswordHash().then((hash) => { options.cryptoObserver?.('dummy_hash'); return hash; });
    }
  }
  private requireEnabled(): void {
    if (!this.options.enabled || !this.limiter || !this.dummyHash) throw new AuthUnavailableError();
  }
  private async limit(kind: 'register' | 'login', emailKey: string, ip: string): Promise<void> {
    await this.limiter!.consumeEmailAndIp(kind, emailKey, ip);
  }
  async register(input: RegisterInput, ip: string): Promise<DurableSessionResult> {
    this.requireEnabled();
    const email = canonicalizeEmail(input.email), handle = normalizeHandle(input.handle);
    const displayName = normalizeDisplayName(input.displayName), password = validatePassword(input.password);
    await this.limit('register', email, ip);
    const passwordHash = await hashPassword(password), token = generateSessionToken();
    const now = this.now(), expiresAt = new Date(now.getTime() + this.ttl);
    const userId = randomUUID(), sessionId = randomUUID();
    try {
      await this.db.$transaction(async (tx) => {
        await tx.userAccount.create({ data: { id: userId, email, displayName, status: 'active' } });
        await tx.userProfile.create({ data: { userId, publicHandle: handle } });
        await tx.passwordCredential.create({ data: { userId, passwordHash, passwordChangedAt: now } });
        await tx.accountSession.create({ data: { id: sessionId, userId, tokenHash: digestSessionToken(token), createdAt: now, lastSeenAt: now, expiresAt } });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new RegistrationUnavailableError();
      throw error;
    }
    return { token, session: { id: sessionId, userId, createdAt: now, expiresAt } };
  }
  async login(input: LoginInput, ip: string, presentedToken?: string): Promise<DurableSessionResult> {
    this.requireEnabled();
    let email: string | undefined;
    try { email = canonicalizeEmail(input.email); } catch { /* generic dummy path */ }
    await this.limit('login', email ?? `invalid:${input.email}`, ip);
    // Resolve the one shared initialization before account selection on every path.
    const dummyHash = await this.dummyHash!;
    const account = email ? await this.db.userAccount.findFirst({ where: { email }, include: { passwordCredential: true } }) : null;
    let verifier = account?.passwordCredential?.passwordHash ?? dummyHash;
    try { parsePasswordHash(verifier); } catch { verifier = dummyHash; }
    this.options.cryptoObserver?.('verify');
    const verified = await verifyPassword(input.password, verifier);
    if (!verified || !account || account.status !== 'active' || !account.passwordCredential) throw new InvalidCredentialsError();
    const token = generateSessionToken(), now = this.now(), expiresAt = new Date(now.getTime() + this.ttl), sessionId = randomUUID();
    await this.db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT id FROM "UserAccount" WHERE id=$1 FOR UPDATE`, account.id);
      const current = await tx.userAccount.findUnique({ where: { id: account.id }, select: { status: true } });
      if (current?.status !== 'active') throw new InvalidCredentialsError();
      await tx.accountSession.create({ data: { id: sessionId, userId: account.id, tokenHash: digestSessionToken(token), createdAt: now, lastSeenAt: now, expiresAt } });
      if (presentedToken) {
        let oldHash: string | undefined;
        try { oldHash = digestSessionToken(presentedToken); } catch { /* ignored */ }
        if (oldHash) await tx.accountSession.updateMany({ where: { tokenHash: oldHash, userId: account.id, revokedAt: null }, data: { revokedAt: now, revocationReason: 'relogin' } });
      }
    });
    return { token, session: { id: sessionId, userId: account.id, createdAt: now, expiresAt } };
  }
  async logout(token?: string): Promise<void> {
    if (!token) return;
    let tokenHash: string;
    try { tokenHash = digestSessionToken(token); } catch { return; }
    await this.db.accountSession.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: this.now(), revocationReason: 'logout' } });
  }
  async resolveSession(token: string): Promise<{ userId: string; sessionId: string } | null> {
    let tokenHash: string;
    try { tokenHash = digestSessionToken(token); } catch { return null; }
    const now = this.now();
    const row = await this.db.accountSession.findUnique({ where: { tokenHash }, include: { user: { select: { status: true } } } });
    if (!row || row.revokedAt || row.expiresAt <= now || row.user.status !== 'active') return null;
    const threshold = new Date(now.getTime() - this.lastSeenInterval);
    await this.db.accountSession.updateMany({ where: { id: row.id, revokedAt: null, expiresAt: { gt: now }, lastSeenAt: { lte: threshold } }, data: { lastSeenAt: now } });
    return { userId: row.userId, sessionId: row.id };
  }
  async cleanupSessions(retentionMs = 30 * 24 * 60 * 60 * 1_000): Promise<number> {
    const cutoff = new Date(this.now().getTime() - retentionMs);
    return (await this.db.accountSession.deleteMany({
      where: { expiresAt: { lt: cutoff }, OR: [{ revokedAt: null }, { revokedAt: { lt: cutoff } }] },
    })).count;
  }
}
