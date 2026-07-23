import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

export interface PublicOriginResolver {
  resolve(hostname: string): Promise<string[]>;
}

export interface PinnedReadinessTransport {
  getJson(url: URL, address: string, timeoutMs: number): Promise<unknown>;
}

export class SystemPublicOriginResolver implements PublicOriginResolver {
  async resolve(hostname: string): Promise<string[]> {
    const literal = stripIpv6Brackets(hostname);
    if (isIP(literal)) return [literal];
    const rows = await lookup(hostname, { all: true, verbatim: true });
    return rows.map(({ address }) => address);
  }
}

export class HttpsPinnedReadinessTransport implements PinnedReadinessTransport {
  async getJson(url: URL, address: string, timeoutMs: number): Promise<unknown> {
    return await new Promise<unknown>((resolve, reject) => {
      let requestHandle: ReturnType<typeof request>;
      const absoluteTimer = setTimeout(() => {
        requestHandle.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
      }, Math.max(1, timeoutMs));
      let settled = false;
      const settle = <T>(action: (value: T) => void, value: T): void => {
        if (settled) return;
        settled = true;
        clearTimeout(absoluteTimer);
        action(value);
      };
      requestHandle = request(url, {
        method: 'GET', headers: { accept: 'application/json' }, timeout: timeoutMs,
        lookup: (_hostname, _options, callback) => callback(null, address, isIP(address) as 4 | 6),
      }, (response) => {
        if (response.statusCode == null || response.statusCode < 200 || response.statusCode >= 300) {
          response.resume(); settle(reject, new Error('not_ready')); return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 256 * 1024) requestHandle.destroy(new Error('response_too_large'));
          else chunks.push(chunk);
        });
        response.on('end', () => {
          try { settle(resolve, JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown); }
          catch (error) { settle(reject, error); }
        });
      });
      requestHandle.once('timeout', () => requestHandle.destroy(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
      requestHandle.once('error', (error) => settle(reject, error));
      requestHandle.end();
    });
  }
}

export function canonicalPublicHostname(hostname: string): string {
  return stripIpv6Brackets(hostname).replace(/\.$/, '').toLowerCase();
}

export function isPublicAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address).split('%', 1)[0]!;
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family !== 6) return false;
  const value = ipv6Value(normalized);
  if (value == null) return false;
  // Unspecified/loopback/IPv4-compatible and mapped representations.
  if (value <= 0xffff_ffffn) return false;
  if ((value >> 32n) === 0xffffn) return isPublicIpv4(ipv4FromNumber(Number(value & 0xffff_ffffn)));
  // IPv4/IPv6 translation embeds an IPv4 destination; validate that destination.
  if ((value >> 32n) === 0x64ff9b0000000000000000n) return isPublicIpv4(ipv4FromNumber(Number(value & 0xffff_ffffn)));
  const first8 = Number(value >> 120n);
  const first10 = Number(value >> 118n);
  if (first8 === 0xff || first8 === 0xfc || first8 === 0xfd || first10 === 0x3fa || first10 === 0x3fb) return false; // multicast, ULA, link/site-local
  const first16 = Number(value >> 112n);
  const first20 = Number(value >> 108n);
  const first28 = Number(value >> 100n);
  const first32 = Number(value >> 96n);
  const first48 = Number(value >> 80n);
  const first64 = value >> 64n;
  if (first64 === 0x0100000000000000n || first20 === 0x3fff0 || first16 === 0x5f00
    || first16 === 0x2002 || first32 === 0x20010000 || first32 === 0x20010db8
    || first48 === 0x64ff9b0001 || first48 === 0x200100020000 || first28 === 0x2001002) return false; // special-use, local-use NAT64, docs, transition, benchmark, ORCHIDv2
  return true;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const value = (((parts[0]! * 256 + parts[1]!) * 256 + parts[2]!) * 256 + parts[3]!) >>> 0;
  const blocked: Array<[number, number]> = [
    [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16],
    [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24], [0xc0586300, 24], [0xc0a80000, 16],
    [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
  ];
  return !blocked.some(([network, prefix]) => (value >>> (32 - prefix)) === (network >>> (32 - prefix)));
}

function ipv6Value(address: string): bigint | null {
  let source = address.toLowerCase();
  const embedded = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(source)?.[1];
  if (embedded) {
    const parts = embedded.split('.').map(Number);
    if (!isPublicOrValidIpv4Parts(parts)) return null;
    source = source.slice(0, -embedded.length) + `${((parts[0]! << 8) | parts[1]!).toString(16)}:${((parts[2]! << 8) | parts[3]!).toString(16)}`;
  }
  const halves = source.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const zeros = 8 - left.length - right.length;
  if ((halves.length === 1 && zeros !== 0) || (halves.length === 2 && zeros < 1)) return null;
  const words = [...left, ...Array.from({ length: zeros }, () => '0'), ...right];
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null;
  return words.reduce((total, word) => (total << 16n) | BigInt(`0x${word}`), 0n);
}

function isPublicOrValidIpv4Parts(parts: number[]): boolean {
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

function ipv4FromNumber(value: number): string {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}
