import { domainToASCII } from 'node:url';

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const WHITESPACE = /\s/u;
const HANDLE = /^[a-z0-9_]{3,20}$/u;
const RESERVED_HANDLES = new Set(['admin', 'api', 'support', 'wordle']);

export function canonicalizeEmail(input: string): string {
  if (typeof input !== 'string') throw new TypeError('invalid email');
  const value = input.replace(/^[\x09-\x0d\x20]+|[\x09-\x0d\x20]+$/gu, '').normalize('NFC');
  if (CONTROL.test(value) || WHITESPACE.test(value)) throw new TypeError('invalid email');
  const firstAt = value.indexOf('@');
  if (firstAt < 1 || firstAt !== value.lastIndexOf('@')) throw new TypeError('invalid email');
  const local = value.slice(0, firstAt);
  const asciiDomain = domainToASCII(value.slice(firstAt + 1));
  if (!asciiDomain || asciiDomain.length > 253 || asciiDomain.startsWith('.') || asciiDomain.endsWith('.') || asciiDomain.includes('..')) {
    throw new TypeError('invalid email');
  }
  const canonical = `${local.toLowerCase()}@${asciiDomain.toLowerCase()}`;
  if (Buffer.byteLength(local, 'utf8') > 64 || Buffer.byteLength(canonical, 'utf8') > 254) throw new TypeError('invalid email');
  return canonical;
}

export function normalizeHandle(input: string): string {
  if (typeof input !== 'string') throw new TypeError('invalid handle');
  const handle = input.trim().toLowerCase();
  if (!HANDLE.test(handle) || RESERVED_HANDLES.has(handle) || handle.startsWith('wr_')) throw new TypeError('invalid handle');
  return handle;
}

export function normalizeDisplayName(input: string): string {
  if (typeof input !== 'string') throw new TypeError('invalid display name');
  const name = input.trim().normalize('NFC');
  const length = Array.from(name).length;
  if (length < 1 || length > 40 || CONTROL.test(name)) throw new TypeError('invalid display name');
  return name;
}

export function validatePassword(input: string): string {
  if (typeof input !== 'string') throw new TypeError('invalid password');
  const length = Array.from(input).length;
  if (length < 12 || length > 128 || Buffer.byteLength(input, 'utf8') > 256 || CONTROL.test(input)) {
    throw new TypeError('invalid password');
  }
  return input;
}
