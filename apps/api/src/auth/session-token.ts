import { createHash, randomBytes } from 'node:crypto';

const TOKEN = /^wr1\.([A-Za-z0-9_-]{43})$/u;

export function generateSessionToken(): string {
  return `wr1.${randomBytes(32).toString('base64url')}`;
}

export function parseSessionToken(value: string): Buffer {
  if (typeof value !== 'string' || value.length !== 47) throw new TypeError('invalid session token');
  const match = TOKEN.exec(value);
  if (!match) throw new TypeError('invalid session token');
  const payload = Buffer.from(match[1]!, 'base64url');
  if (payload.length !== 32 || payload.toString('base64url') !== match[1]) throw new TypeError('invalid session token');
  return payload;
}

export function digestSessionToken(value: string): string {
  parseSessionToken(value);
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
