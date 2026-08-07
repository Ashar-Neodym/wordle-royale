import { CURATED_ANSWERS_V1 } from './curated-answer-pools.ts';

export const CHALLENGE_VERSION = 1;
export const CHALLENGE_ID_PATTERN = /^c([0-9a-f]{2})-([0-9a-f]{8})-([0-9a-f]{2})$/;
export const CHALLENGE_RANDOM_ATTEMPT_LIMIT = 128;

const UINT32_RANGE = 0x1_0000_0000;
const UNBIASED_NONCE_LIMIT = Math.floor(UINT32_RANGE / CURATED_ANSWERS_V1.length) * CURATED_ANSWERS_V1.length;

export type ChallengeIdFailureReason = 'malformed' | 'checksum_mismatch' | 'unsupported_version';

export interface DecodedChallengeId {
  ok: true;
  challengeId: string;
  version: 1;
  nonce: number;
  answerIndex: number;
  answer: (typeof CURATED_ANSWERS_V1)[number];
}

/** Failure values deliberately contain no nonce-derived answer information. */
export interface InvalidChallengeId {
  ok: false;
  reason: ChallengeIdFailureReason;
}

export type ChallengeIdResult = DecodedChallengeId | InvalidChallengeId;
export type GetRandomValues = (array: Uint32Array) => Uint32Array;

/** CRC-8/ATM (polynomial 0x07, initial value 0) over the supplied bytes. */
export function crc8Atm(bytes: ArrayLike<number>): number {
  let crc = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

function checksum(version: number, nonce: number): number {
  return crc8Atm([
    version,
    (nonce >>> 24) & 0xff,
    (nonce >>> 16) & 0xff,
    (nonce >>> 8) & 0xff,
    nonce & 0xff,
  ]);
}

export function formatChallengeId(nonce: number, version = CHALLENGE_VERSION): string {
  if (!Number.isInteger(version) || version < 0 || version > 0xff) throw new RangeError('Challenge version must be a byte.');
  if (!Number.isInteger(nonce) || nonce < 0 || nonce > 0xffff_ffff) throw new RangeError('Challenge nonce must be a uint32.');
  const body = `${version.toString(16).padStart(2, '0')}-${nonce.toString(16).padStart(8, '0')}`;
  return `c${body}-${checksum(version, nonce).toString(16).padStart(2, '0')}`;
}

/** Validate in protocol order: format, checksum, version, then answer lookup. */
export function parseChallengeId(value: unknown): ChallengeIdResult {
  if (typeof value !== 'string') return { ok: false, reason: 'malformed' };
  const match = CHALLENGE_ID_PATTERN.exec(value);
  if (!match) return { ok: false, reason: 'malformed' };
  const version = Number.parseInt(match[1]!, 16);
  const nonce = Number.parseInt(match[2]!, 16);
  const suppliedChecksum = Number.parseInt(match[3]!, 16);
  if (checksum(version, nonce) !== suppliedChecksum) return { ok: false, reason: 'checksum_mismatch' };
  if (version !== CHALLENGE_VERSION) return { ok: false, reason: 'unsupported_version' };
  const answerIndex = nonce % CURATED_ANSWERS_V1.length;
  return {
    ok: true,
    challengeId: formatChallengeId(nonce),
    version: CHALLENGE_VERSION,
    nonce,
    answerIndex,
    answer: CURATED_ANSWERS_V1[answerIndex]!,
  };
}

export const decodeChallengeId = parseChallengeId;

/** Validate and canonicalize an ID without deriving or reading its answer. */
export function canonicalizeChallengeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = CHALLENGE_ID_PATTERN.exec(value);
  if (!match) return null;
  const version = Number.parseInt(match[1]!, 16);
  const nonce = Number.parseInt(match[2]!, 16);
  const suppliedChecksum = Number.parseInt(match[3]!, 16);
  if (checksum(version, nonce) !== suppliedChecksum || version !== CHALLENGE_VERSION) return null;
  return formatChallengeId(nonce);
}

/**
 * Create an unbiased V1 identifier using an injected browser-compatible
 * getRandomValues implementation. No fallback to weaker randomness is allowed.
 */
export function createChallengeId(getRandomValues: GetRandomValues): string {
  if (typeof getRandomValues !== 'function') throw new TypeError('A cryptographic getRandomValues function is required.');
  const values = new Uint32Array(1);
  for (let attempt = 0; attempt < CHALLENGE_RANDOM_ATTEMPT_LIMIT; attempt += 1) {
    getRandomValues(values);
    const nonce = values[0]!;
    if (nonce < UNBIASED_NONCE_LIMIT) return formatChallengeId(nonce);
  }
  throw new Error('Unable to draw an unbiased challenge nonce.');
}
