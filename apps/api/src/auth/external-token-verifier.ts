import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';
import type { ExternalOidcConfig } from '../config/runtime-config.ts';

const MAX_TOKEN_BYTES = 16_384;
// OIDC subjects are opaque, case-sensitive identifiers of at most 255 ASCII
// characters. Do not impose a provider-specific UUID format.
const OIDC_SUBJECT = /^[\x21-\x7e]{1,255}$/u;

export class ExternalTokenInvalidError extends Error {
  readonly code = 'invalid_external_token';
  constructor() { super('External token is invalid.'); }
}

export type VerifiedExternalIdentity = { issuer: string; subject: string };

export class ExternalTokenVerifier {
  constructor(
    private readonly config: ExternalOidcConfig,
    private readonly key: JWTVerifyGetKey,
    private readonly now: () => Date = () => new Date(),
  ) {}

  static remote(config: ExternalOidcConfig): ExternalTokenVerifier {
    return new ExternalTokenVerifier(config, createRemoteJWKSet(new URL(config.jwksUrl)));
  }

  async verify(token: string): Promise<VerifiedExternalIdentity> {
    try {
      if (typeof token !== 'string' || Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES || token.split('.').length !== 3) throw new Error();
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: this.config.algorithms,
        currentDate: this.now(),
      });
      this.validateClaims(payload);
      return { issuer: this.config.issuer, subject: payload.sub! };
    } catch {
      // Deliberately collapse jose details and never include the bearer token.
      throw new ExternalTokenInvalidError();
    }
  }

  private validateClaims(payload: JWTPayload): void {
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) throw new Error();
    if (typeof payload.sub !== 'string' || !OIDC_SUBJECT.test(payload.sub)) throw new Error();
  }
}
