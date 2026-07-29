import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { validatePassword } from './auth-input.js';

export const SCRYPT_N = 131_072;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_MAXMEM = 268_435_456;
const SALT_BYTES = 32;
const KEY_BYTES = 64;
const PREFIX = '$wr$scrypt$v=1$ln=17,r=8,p=1$';

type ParsedHash = { salt: Buffer; key: Buffer };

const decodeExact = (field: string, bytes: number): Buffer => {
  if (!/^[A-Za-z0-9_-]+$/u.test(field)) throw new TypeError('invalid password hash');
  const decoded = Buffer.from(field, 'base64url');
  if (decoded.length !== bytes || decoded.toString('base64url') !== field) throw new TypeError('invalid password hash');
  return decoded;
};

export function parsePasswordHash(value: string): ParsedHash {
  if (typeof value !== 'string' || value.length > 200 || !value.startsWith(PREFIX)) throw new TypeError('invalid password hash');
  const fields = value.slice(PREFIX.length).split('$');
  if (fields.length !== 2) throw new TypeError('invalid password hash');
  return { salt: decodeExact(fields[0]!, SALT_BYTES), key: decodeExact(fields[1]!, KEY_BYTES) };
}

const derive = (password: string, salt: Buffer): Promise<Buffer> => new Promise((resolve, reject) => {
  scryptCallback(password, salt, KEY_BYTES, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM,
  }, (error, key) => error ? reject(error) : resolve(key));
});

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `${PREFIX}${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, serialized: string): Promise<boolean> {
  if (typeof password !== 'string' || Array.from(password).length > 128 || Buffer.byteLength(password, 'utf8') > 256) return false;
  let parsed: ParsedHash;
  try { parsed = parsePasswordHash(serialized); } catch { return false; }
  const candidate = await derive(password, parsed.salt);
  return timingSafeEqual(candidate, parsed.key);
}

export async function createDummyPasswordHash(): Promise<string> {
  return hashPassword(randomBytes(24).toString('base64url'));
}

export async function dummyVerifyPassword(password: string, dummyHash: string): Promise<boolean> {
  await verifyPassword(password, dummyHash);
  return false;
}
