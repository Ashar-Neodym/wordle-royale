import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { canonicalJson, receiptFor } from './auth-activation-preflight-core.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const RECEIPT = /^[a-f0-9]{64}$/u;
const expectedOwner = () => typeof process.getuid === 'function' ? process.getuid() : undefined;
async function restricted(path, kind, mode) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || (kind === 'directory' ? !stat.isDirectory() : !stat.isFile())) throw new Error(`consumption_${kind}_invalid`);
  if ((stat.mode & 0o777) !== mode || (expectedOwner() !== undefined && stat.uid !== expectedOwner())) throw new Error(`consumption_${kind}_permissions_invalid`);
  if (await realpath(path) !== resolve(path)) throw new Error(`consumption_${kind}_path_invalid`);
  return stat;
}

/** Atomically consumes an approval and durably persists the receipt and containing directory entry. */
export async function consumeApprovalDurably(directory, binding) {
  if (!isAbsolute(directory) || resolve(directory) !== directory || basename(directory) === '') throw new Error('consumption_directory_path_invalid');
  if (!binding || !ID.test(binding.approvalId) || !ID.test(binding.runId) || !RECEIPT.test(binding.preflightReceipt) || !RECEIPT.test(binding.accountFingerprint)) throw new Error('consumption_binding_invalid');
  try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  await restricted(directory, 'directory', 0o700);
  const path = join(directory, `${binding.approvalId}.json`);
  const payload = { schemaVersion: 2, ...binding, consumed: true };
  payload.consumptionReceipt = receiptFor(payload);
  const directoryHandle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const directoryStat = await directoryHandle.stat();
    if (!directoryStat.isDirectory() || (directoryStat.mode & 0o777) !== 0o700 || (expectedOwner() !== undefined && directoryStat.uid !== expectedOwner())) throw new Error('consumption_directory_permissions_invalid');
    const anchoredDirectory = `/proc/self/fd/${directoryHandle.fd}`;
    if (await realpath(anchoredDirectory) !== directory) throw new Error('consumption_directory_path_invalid');
    const handle = await open(join(anchoredDirectory, `${binding.approvalId}.json`), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await handle.writeFile(`${canonicalJson(payload)}\n`);
      await handle.sync();
      const fileStat = await handle.stat();
      if (!fileStat.isFile() || (fileStat.mode & 0o777) !== 0o600 || (expectedOwner() !== undefined && fileStat.uid !== expectedOwner())) throw new Error('consumption_file_permissions_invalid');
      const namedStat = await restricted(path, 'file', 0o600);
      if (namedStat.dev !== fileStat.dev || namedStat.ino !== fileStat.ino) throw new Error('consumption_file_path_invalid');
    } finally { await handle.close(); }
    const currentDirectoryStat = await restricted(directory, 'directory', 0o700);
    if (currentDirectoryStat.dev !== directoryStat.dev || currentDirectoryStat.ino !== directoryStat.ino) throw new Error('consumption_directory_path_invalid');
    await directoryHandle.sync();
  } finally { await directoryHandle.close(); }
  return { path, consumptionReceipt: payload.consumptionReceipt };
}
