import test from 'node:test';
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commitLocalReceiptNoReplace } from './g0-local-noreplace-commit.mjs';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'g0-noreplace-')); await chmod(root, 0o700);
  const parentPath = join(root, 'receipts'); await mkdir(parentPath, { mode: 0o700 });
  const parentHandle = await open(parentPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const tempName = `.an5b-receipt-${'a'.repeat(32)}`; const finalName = 'receipt.json';
  const tempHandle = await open(join(parentPath, tempName), constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  await tempHandle.writeFile('complete\n'); await tempHandle.sync();
  return { root, parentPath, parentHandle, tempName, finalName, tempHandle };
}

const commit = (f) => commitLocalReceiptNoReplace({ parentHandle: f.parentHandle, tempHandle: f.tempHandle, tempName: f.tempName, finalName: f.finalName });

test('FD-bound commit atomically publishes the exact 0600 nlink1 temp', async (t) => {
  const f = await setup(); t.after(async () => { await Promise.allSettled([f.tempHandle.close(), f.parentHandle.close()]); await rm(f.root, { recursive: true, force: true }); });
  const before = await f.tempHandle.stat({ bigint: true });
  assert.deepEqual(await commit(f), { status: 'PUBLISHED' });
  const final = await lstat(join(f.parentPath, f.finalName), { bigint: true });
  assert.equal(final.ino, before.ino); assert.equal(final.nlink, 1n); assert.equal(Number(final.mode) & 0o7777, 0o600);
  assert.equal(await readFile(join(f.parentPath, f.finalName), 'utf8'), 'complete\n');
});

test('collision never overwrites an existing final and leaves temp named', async (t) => {
  const f = await setup(); t.after(async () => { await Promise.allSettled([f.tempHandle.close(), f.parentHandle.close()]); await rm(f.root, { recursive: true, force: true }); });
  await writeFile(join(f.parentPath, f.finalName), 'occupied\n', { mode: 0o600 });
  assert.deepEqual(await commit(f), { status: 'COLLISION' });
  assert.equal(await readFile(join(f.parentPath, f.finalName), 'utf8'), 'occupied\n');
  assert.equal(await readFile(join(f.parentPath, f.tempName), 'utf8'), 'complete\n');
});

test('hardlinked temp fails nlink1 policy before publication', async (t) => {
  const f = await setup(); t.after(async () => { await Promise.allSettled([f.tempHandle.close(), f.parentHandle.close()]); await rm(f.root, { recursive: true, force: true }); });
  await link(join(f.parentPath, f.tempName), join(f.parentPath, 'attack-link'));
  await assert.rejects(commit(f), { code: 'NOREPLACE_TEMP_POLICY' });
  await assert.rejects(lstat(join(f.parentPath, f.finalName)));
});
