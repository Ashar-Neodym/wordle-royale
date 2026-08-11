import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { discoverWebTests } from '../../scripts/run-tests.mjs';

const webRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

describe('canonical exhaustive web test discovery', () => {
  it('selects every supported src test exactly once in deterministic sorted order', async () => {
    const absolute = await discoverWebTests(resolve(webRoot, 'src'));
    const selected = absolute.map((path) => relative(webRoot, path).split('\\').join('/'));
    assert.ok(selected.length > 32, `expected the complete suite, got ${selected.length}`);
    assert.deepEqual(selected, [...selected].sort((left, right) => left.localeCompare(right, 'en')));
    assert.equal(new Set(selected).size, selected.length);
    for (const path of selected) assert.match(path, /^src\/.+\.test\.(?:[cm]?js|[cm]?ts)$/);
    assert.ok(selected.includes('src/lib/test-discovery.test.ts'), 'the discovery regression must discover itself');
  });

  it('recognizes every directly executable Node test extension without admitting JSX', async () => {
    const fixtureRoot = await mkdtemp(resolve(tmpdir(), 'wordle-web-test-discovery-'));
    try {
      const supported = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'];
      await Promise.all([
        ...supported.map((extension) => writeFile(resolve(fixtureRoot, `fixture.test.${extension}`), '')),
        writeFile(resolve(fixtureRoot, 'unsupported.test.jsx'), ''),
        writeFile(resolve(fixtureRoot, 'unsupported.test.tsx'), ''),
        writeFile(resolve(fixtureRoot, 'not-a-test.ts'), ''),
      ]);
      const selected = (await discoverWebTests(fixtureRoot)).map((path) => relative(fixtureRoot, path));
      assert.deepEqual(
        selected,
        supported.map((extension) => `fixture.test.${extension}`).sort((left, right) => left.localeCompare(right, 'en')),
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('includes production-boundary auth, API, and configuration tests', async () => {
    const selected = (await discoverWebTests(resolve(webRoot, 'src')))
      .map((path) => relative(webRoot, path).split('\\').join('/'));
    for (const required of [
      'src/lib/durable-auth-bff.test.ts',
      'src/lib/api-authority.test.ts',
      'src/lib/api-client-result-validation.test.ts',
      'src/lib/auth-presentation.test.ts',
      'src/lib/public-web-identity.test.ts',
      'src/app/account/account-result.test.ts',
    ]) assert.equal(selected.filter((path) => path === required).length, 1, `${required} must be selected exactly once`);
  });
});
