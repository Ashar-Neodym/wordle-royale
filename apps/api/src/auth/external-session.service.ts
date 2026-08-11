import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { normalizeDisplayName, normalizeHandle } from './auth-input.ts';
import { InvalidCredentialsError, type DurableAuthPersistenceService, type DurableSessionResult } from './durable-auth-persistence.service.ts';
import { ExternalTokenInvalidError, type ExternalTokenVerifier } from './external-token-verifier.ts';

export class ExternalAuthUnavailableError extends Error {
  readonly code = 'external_auth_unavailable';
  constructor() { super('External authentication is unavailable.'); }
}
export class ExternalIdentityConflictError extends Error {
  readonly code = 'external_identity_conflict';
  constructor() { super('External account exchange could not be completed.'); }
}
export type ExternalSessionInput = { token: string; clientIp: string; presentedSessionToken?: string; handle?: string; displayName?: string };

export class ExternalSessionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly durableAuth: DurableAuthPersistenceService,
    private readonly verifier: ExternalTokenVerifier | null,
  ) {}

  async exchange(input: ExternalSessionInput): Promise<DurableSessionResult & { created: boolean }> {
    if (!this.verifier) throw new ExternalAuthUnavailableError();
    await this.durableAuth.limitExternalIp(input.clientIp);
    const identity = await this.verifier.verify(input.token);
    await this.durableAuth.limitExternalSubject(identity.issuer, identity.subject);
    let userId: string;
    let created = false;
    const existing = await this.db.externalIdentity.findUnique({
      where: { issuer_subject: identity },
      include: { user: { select: { status: true } } },
    });
    if (existing) {
      if (existing.user.status !== 'active') throw new ExternalTokenInvalidError();
      userId = existing.userId;
    } else {
      let handle: string;
      let displayName: string;
      try {
        handle = normalizeHandle(input.handle as string);
        displayName = normalizeDisplayName(input.displayName as string);
      } catch {
        throw new ExternalIdentityConflictError();
      }
      const candidateUserId = randomUUID();
      try {
        await this.db.$transaction(async (tx) => {
          const raced = await tx.externalIdentity.findUnique({ where: { issuer_subject: identity } });
          if (raced) { userId = raced.userId; return; }
          await tx.userAccount.create({ data: { id: candidateUserId, email: null, displayName, status: 'active' } });
          await tx.userProfile.create({ data: { userId: candidateUserId, publicHandle: handle } });
          await tx.externalIdentity.create({ data: { issuer: identity.issuer, subject: identity.subject, userId: candidateUserId } });
          userId = candidateUserId;
          created = true;
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw new ExternalAuthUnavailableError();
        const winner = await this.db.externalIdentity.findUnique({ where: { issuer_subject: identity } });
        if (!winner) throw new ExternalIdentityConflictError();
        userId = winner.userId;
      }
    }
    try {
      const session = await this.durableAuth.issueSessionForUser(userId!, input.presentedSessionToken);
      return { ...session, created };
    } catch (error) {
      // An identity can be deactivated between lookup/creation and issuance.
      // Keep that state indistinguishable from any other rejected bearer token.
      if (error instanceof InvalidCredentialsError) throw new ExternalTokenInvalidError();
      throw new ExternalAuthUnavailableError();
    }
  }
}
