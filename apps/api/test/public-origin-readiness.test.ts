import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPublicAddress } from '../src/gameplay/public-origin-readiness.ts';
import { DefaultOperatorReadinessVerifier, SpeedLifecycleOperatorError } from '../src/gameplay/speed-lifecycle-operator.service.ts';

const healthy = {
  dependencies: {
    speedRuntime: { status: 'ok' }, database: { status: 'ok' },
    applicationSchema: { status: 'ok' }, standardDictionary: { status: 'ok' },
  },
};
const prisma = {
  checkApplicationSchema: async () => ({ status: 'ok' }),
  checkSpeedReadyLifecycleSchema: async () => ({ status: 'ok' }),
};
const dictionary = { checkStandardDictionary: async () => ({ status: 'ok' }) };

async function failure(action: () => Promise<unknown>): Promise<string> {
  try { await action(); return 'PASS'; }
  catch (error) { return (error as SpeedLifecycleOperatorError).code; }
}

describe('Ticket 199 public-origin readiness fencing', () => {
  it('classifies dangerous IPv4, IPv6, mapped, translated, and special-use forms as non-public', () => {
    for (const address of [
      '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1',
      '192.168.1.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', 'fe80::1',
      '100::1', '3fff::1', '5f00::1', 'fc00::1', 'fd00::1', 'fec0::1', 'feff::1', 'ff02::1',
      '::ffff:127.0.0.1', '64:ff9b::a00:1', '2001:db8::1', '2002:7f00:1::',
      '64:ff9b:1::7f00:1', '64:ff9b:1::a00:1', '64:ff9b:1::a9fe:a9fe',
    ]) assert.equal(isPublicAddress(address), false, address);
    assert.equal(isPublicAddress('8.8.8.8'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
    assert.equal(isPublicAddress('2001:4860:4860::8888'), true);
  });

  it('rejects RFC 8215 local-use NAT64 DNS answers before transport', async () => {
    let transported = 0;
    for (const address of ['64:ff9b:1::7f00:1', '64:ff9b:1::a00:1', '64:ff9b:1::a9fe:a9fe']) {
      const verifier = new DefaultOperatorReadinessVerifier(prisma as any, dictionary as any, {
        resolve: async () => [address],
      }, { getJson: async () => { transported += 1; return healthy; } });
      assert.equal(
        await failure(() => verifier.verify('https://api.example.test', ['api.example.test'])),
        'railway_scope_mismatch',
        address,
      );
    }
    assert.equal(transported, 0);
  });

  it('rejects literal and WHATWG-normalized encoded destinations before transport', async () => {
    let transported = 0;
    const verifier = new DefaultOperatorReadinessVerifier(prisma as any, dictionary as any, {
      resolve: async (hostname) => [hostname],
    }, { getJson: async () => { transported += 1; return healthy; } });
    for (const raw of [
      'localhost', '127.0.0.1', '127.1', '2130706433', '0x7f000001', '017700000001',
      '0.0.0.0', '169.254.169.254', '10.0.0.1', '192.168.1.1', '[::]', '[::1]',
      '[fe80::1]', '[fc00::1]', '[::ffff:127.0.0.1]', '[64:ff9b::a00:1]',
    ]) {
      const url = `https://${raw}`;
      const canonical = new URL(url).hostname;
      assert.equal(await failure(() => verifier.verify(url, [canonical])), 'railway_scope_mismatch', raw);
    }
    assert.equal(transported, 0);
  });

  it('rejects special-use hostnames before DNS or transport', async () => {
    let resolved = 0;
    let transported = 0;
    const verifier = new DefaultOperatorReadinessVerifier(prisma as any, dictionary as any, {
      resolve: async () => { resolved += 1; return ['8.8.8.8']; },
    }, { getJson: async () => { transported += 1; return healthy; } });
    for (const hostname of ['localhost', 'x.localhost', 'printer.local', 'service.internal', 'router.home.arpa', 'metadata', 'metadata.google.internal']) {
      assert.equal(await failure(() => verifier.verify(`https://${hostname}`, [hostname])), 'railway_scope_mismatch');
    }
    assert.equal(resolved, 0);
    assert.equal(transported, 0);
  });

  it('fails closed on mixed public/private DNS answers and pins a validated public answer', async () => {
    const connected: string[] = [];
    const rebinding = new DefaultOperatorReadinessVerifier(prisma as any, dictionary as any, {
      resolve: async () => ['8.8.8.8', '127.0.0.1'],
    }, { getJson: async (_url, address) => { connected.push(address); return healthy; } });
    assert.equal(await failure(() => rebinding.verify('https://api.example.test', ['api.example.test'])), 'railway_scope_mismatch');
    assert.deepEqual(connected, []);

    const pinned = new DefaultOperatorReadinessVerifier(prisma as any, dictionary as any, {
      resolve: async () => ['9.9.9.9', '8.8.8.8'],
    }, { getJson: async (url, address) => { (connected as string[]).push(`${url.hostname}:${address}`); return healthy; } });
    assert.deepEqual(await pinned.verify('https://api.example.test', ['api.example.test']), {
      schema: true, dictionary: true, reconciler: true, standard: true,
    });
    assert.deepEqual(connected, ['api.example.test:8.8.8.8']);
  });

  it('enforces an absolute deadline when the readiness transport never settles', async () => {
    const verifier = new DefaultOperatorReadinessVerifier(prisma as any, dictionary as any, {
      resolve: async () => ['8.8.8.8'],
    }, { getJson: async () => await new Promise<never>(() => undefined) });
    const started = performance.now();
    assert.equal(await failure(() => verifier.verify('https://api.example.test', ['api.example.test'], 25)), 'operator_wait_timeout');
    assert.ok(performance.now() - started < 125);
  });

  it('enforces the same absolute deadline when DNS resolution never settles', async () => {
    const verifier = new DefaultOperatorReadinessVerifier(prisma as any, dictionary as any, {
      resolve: async () => await new Promise<never>(() => undefined),
    }, { getJson: async () => healthy });
    const started = performance.now();
    assert.equal(await failure(() => verifier.verify('https://api.example.test', ['api.example.test'], 25)), 'operator_wait_timeout');
    assert.ok(performance.now() - started < 125);
  });
});
