import { createHmac } from 'node:crypto';

export type AuthRateAction = 'register_email' | 'register_ip' | 'login_email' | 'login_ip';
type QueryClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};
type TransactionClient = QueryClient & {
  $transaction<T>(callback: (tx: QueryClient) => Promise<T>): Promise<T>;
};
export class AuthRateLimitedError extends Error {
  readonly code = 'auth_rate_limited';
  constructor() { super('Authentication temporarily unavailable.'); }
}
export class PostgresAuthRateLimiter {
  static readonly windowMs = 15 * 60 * 1_000;
  constructor(private readonly db: QueryClient, private readonly key: Buffer, private readonly now: () => Date = () => new Date()) {
    if (key.length < 32) throw new Error('AUTH_RATE_LIMIT_KEY must contain at least 32 bytes');
  }
  private digest(action: AuthRateAction, value: string): string {
    return createHmac('sha256', this.key).update(action).update('\0').update(value).digest('hex');
  }
  async consume(action: AuthRateAction, value: string, limit: number): Promise<void> {
    await this.consumeWith(this.db, action, value, limit);
  }
  private async consumeWith(db: QueryClient, action: AuthRateAction, value: string, limit: number): Promise<void> {
    const now = this.now();
    const windowStart = new Date(Math.floor(now.getTime() / PostgresAuthRateLimiter.windowMs) * PostgresAuthRateLimiter.windowMs);
    const windowEnd = new Date(windowStart.getTime() + PostgresAuthRateLimiter.windowMs);
    const rows = await db.$queryRawUnsafe<Array<{ attemptCount: number }>>(
      `INSERT INTO "AuthRateLimitBucket" ("action","keyHash","windowStartedAt","attemptCount","blockedUntil","updatedAt")
       VALUES ($1,$2,$3,1,NULL,$4)
       ON CONFLICT ("action","keyHash") DO UPDATE SET
         "windowStartedAt"=CASE WHEN "AuthRateLimitBucket"."windowStartedAt"<>EXCLUDED."windowStartedAt" THEN EXCLUDED."windowStartedAt" ELSE "AuthRateLimitBucket"."windowStartedAt" END,
         "attemptCount"=CASE WHEN "AuthRateLimitBucket"."windowStartedAt"<>EXCLUDED."windowStartedAt" THEN 1 ELSE "AuthRateLimitBucket"."attemptCount"+1 END,
         "blockedUntil"=CASE WHEN "AuthRateLimitBucket"."windowStartedAt"<>EXCLUDED."windowStartedAt" THEN NULL WHEN "AuthRateLimitBucket"."attemptCount"+1>$5 THEN $6 ELSE "AuthRateLimitBucket"."blockedUntil" END,
         "updatedAt"=EXCLUDED."updatedAt" RETURNING "attemptCount"`,
      action, this.digest(action, value), windowStart, now, limit, windowEnd,
    );
    if (!rows[0] || rows[0].attemptCount > limit) throw new AuthRateLimitedError();
  }
  async consumeEmailAndIp(kind: 'register' | 'login', email: string, ip: string): Promise<void> {
    const emailLimit = kind === 'register' ? 5 : 10;
    const ipLimit = kind === 'register' ? 20 : 30;
    await (this.db as TransactionClient).$transaction(async (tx) => {
      await this.consumeWith(tx, `${kind}_email`, email, emailLimit);
      await this.consumeWith(tx, `${kind}_ip`, ip, ipLimit);
    });
  }
  async cleanup(before: Date): Promise<number> {
    return this.db.$executeRawUnsafe(`DELETE FROM "AuthRateLimitBucket" WHERE "windowStartedAt"<$1 AND ("blockedUntil" IS NULL OR "blockedUntil"<$1)`, before);
  }
}
