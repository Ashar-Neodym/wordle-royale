import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';

const previewDemoCookieName = 'wr_preview_demo_session';
const previewDemoHeaderName = 'x-wordle-preview-session';
const defaultTtlSeconds = 60 * 60 * 2;

type PreviewSessionRecord = {
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
};

type HeaderBag = Record<string, string | string[] | undefined>;
type RequestLike = { headers?: HeaderBag } | undefined;
type ResponseLike = { setHeader?: (name: string, value: string | string[]) => void } | undefined;

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookie(header: string | string[] | undefined, name: string): string | undefined {
  const cookieHeader = Array.isArray(header) ? header.join('; ') : header;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rawValue.join('='));
  }
  return undefined;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function ttlSeconds(): number {
  const parsed = Number.parseInt(process.env.PREVIEW_DEMO_SESSION_TTL_SECONDS ?? '', 10);
  if (Number.isFinite(parsed) && parsed !== 0) return parsed;
  return defaultTtlSeconds;
}

function cookieSecure(): boolean {
  const configured = process.env.COOKIE_SECURE;
  if (configured === undefined || configured === '') return process.env.APP_ENV !== 'local' && process.env.NODE_ENV === 'production';
  return configured === '1' || configured.toLowerCase() === 'true' || configured.toLowerCase() === 'yes';
}

@Injectable()
export class PreviewDemoSessionService {
  private readonly sessions = new Map<string, PreviewSessionRecord>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  cookieName(): string {
    return previewDemoCookieName;
  }

  headerName(): string {
    return previewDemoHeaderName;
  }

  resolveUserId(request: RequestLike): string | null {
    const token = this.sessionTokenFrom(request);
    if (!token) return null;
    const hash = tokenHash(token);
    const session = this.sessions.get(hash);
    if (!session) return null;
    const now = new Date();
    if (session.expiresAt.getTime() <= now.getTime()) {
      this.sessions.delete(hash);
      return null;
    }
    session.lastSeenAt = now;
    return session.userId;
  }

  async start(response: ResponseLike): Promise<{ userId: string; handle: string; displayName: string; expiresAt: string; cookieName: string }> {
    const token = randomBytes(32).toString('base64url');
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ttlSeconds() * 1000);
    const userId = randomUUID();
    const suffix = userId.replace(/-/g, '').slice(0, 8);
    const handle = `demo_${suffix}`;
    const displayName = `Preview Demo ${suffix}`;

    await this.prisma.client.userAccount.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: null,
        displayName,
        status: 'active',
        profile: { create: { publicHandle: handle, avatarUrl: null } },
      },
      update: { displayName },
    });

    this.sessions.set(tokenHash(token), { tokenHash: tokenHash(token), userId, createdAt, expiresAt, lastSeenAt: createdAt });
    response?.setHeader?.('Set-Cookie', this.cookieHeader(token, expiresAt));

    return { userId, handle, displayName, expiresAt: expiresAt.toISOString(), cookieName: previewDemoCookieName };
  }

  private sessionTokenFrom(request: RequestLike): string | undefined {
    const headers = request?.headers ?? {};
    return parseCookie(headers.cookie, previewDemoCookieName) ?? headerValue(headers[previewDemoHeaderName]);
  }

  private cookieHeader(token: string, expiresAt: Date): string {
    const parts = [
      `${previewDemoCookieName}=${encodeURIComponent(token)}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Expires=${expiresAt.toUTCString()}`,
      'Max-Age=' + Math.max(1, ttlSeconds()),
    ];
    if (cookieSecure()) parts.push('Secure');
    return parts.join('; ');
  }
}
