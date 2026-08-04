import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalProviderToolJson, PROVIDER_TOOL_SCHEMA } from './g0-provider-tool-bundle.mjs';
import { createG0RetryAdapterRunner } from './g0-retry-evidence-collector-runner.mjs';

const sha = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const limits = { timeoutMs: 3000, stdoutBytes: 4096, stderrBytes: 4096 };
const argv = ['collect', '--provider', 'vercel', '--challenge-id', 'c', '--run-id', 'r', '--nonce', 'n', '--collector-key-id', 'k', '--challenge-digest', `sha256:${'a'.repeat(64)}`, '--policy-digest', `sha256:${'b'.repeat(64)}`, '--format', 'json'];
function descriptor() {
  return {
    schemaVersion: PROVIDER_TOOL_SCHEMA, distribution: 'official_npm_cli', package: 'vercel', version: '58.4.4',
    bundleRoot: '/opt/wordle-am2-CANARY', bundleRealpath: '/opt/wordle-am2-CANARY', entrypoint: 'node_modules/vercel/dist/vc.js',
    entrypointSha256: 'sha256:56b16d6893212069398eb30e2d96943421cd8a5ba7ea3372a1dd5743ed23d363', packageJsonSha256: `sha256:${'1'.repeat(64)}`,
    lockfileSha256: 'sha256:bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90', treeManifestSha256: `sha256:${'2'.repeat(64)}`,
    runtime: { path: '/usr/bin/node', realpath: '/usr/bin/node', version: 'v18.19.1', sha256: 'sha256:f3f93db342d5ac5bb61656d0599a603a73779e98befd9342171e550002725f4d' },
    sessionMode: 'standard_os_user_session', invocationProfile: 'vercel-g0-readonly/1', invocationProfileSha256: `sha256:${'3'.repeat(64)}`, nativeBinary: null,
  };
}
async function executable(root, source) {
  const path = join(root, 'adapter.mjs'); await writeFile(path, source, { mode: 0o500 }); await chmod(path, 0o500);
  return { path, realpath: path, sha256: sha(source), version: 'am2-test/1' };
}
const syntheticValidator = async ({ descriptor: value, expectedProvider, betweenSnapshots }) => {
  assert.equal(expectedProvider, 'vercel'); assert.deepEqual(value, descriptor());
  const before = canonicalProviderToolJson(value); const result = await betweenSnapshots();
  assert.equal(canonicalProviderToolJson(value), before); return { operationResult: result };
};

test('plan-v2 runner transfers only bounded canonical descriptor bytes on read-only fd3', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wordle-am2-fd-')), tool = descriptor(), wire = `${canonicalProviderToolJson(tool)}\n`;
  try {
    const source = `#!/usr/bin/node\nimport{readFileSync,readlinkSync}from'node:fs';import{spawnSync}from'node:child_process';let input='';process.stdin.on('data',x=>input+=x);const descriptorLink=readlinkSync('/proc/self/fd/3'),flags=readFileSync('/proc/self/fdinfo/3','utf8').match(/^flags:\\s+(\\d+)/m)?.[1];const bytes=readFileSync(3,'utf8');const child=spawnSync('/usr/bin/node',['-e',"const fs=require('fs');let link;try{link=fs.readlinkSync('/proc/self/fd/3')}catch{}process.exit(link===process.argv[1]?1:0)",descriptorLink],{encoding:'utf8'});process.stdout.write(JSON.stringify({wire:bytes===${JSON.stringify(wire)},argv:process.argv.slice(2).length,env:Object.keys(process.env).sort(),hidden:!JSON.stringify(process.argv).includes('wordle-am2-CANARY')&&!JSON.stringify(process.env).includes('wordle-am2-CANARY'),readOnly:(Number.parseInt(flags??'3',8)&3)===0,child:child.status,input}));\n`;
    const policy = await executable(root, source), runner = createG0RetryAdapterRunner({ totalTimeoutMs: 5000, toolBundleValidator: syntheticValidator });
    const output = await runner.run({ provider: 'vercel', executable: policy, tool, argv, limits });
    assert.deepEqual(JSON.parse(output), { wire: true, argv: 17, env: ['LANG', 'LC_ALL', 'PATH', 'TZ'], hidden: true, readOnly: true, child: 0, input: '' }); assert.equal(output.includes('wordle-am2-CANARY'), false); await runner.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('plan-v1 adapter receives no usable fd3 and keeps exact argv/environment behavior', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wordle-am2-v1-'));
  try {
    const source = `#!/usr/bin/node\nimport{readlinkSync}from'node:fs';let target='closed';try{target=readlinkSync('/proc/self/fd/3')}catch{}process.stdout.write(JSON.stringify({argv:process.argv.slice(2).length,env:Object.keys(process.env).sort(),descriptorPipe:target.startsWith('pipe:')}));\n`;
    const policy = await executable(root, source), runner = createG0RetryAdapterRunner({ totalTimeoutMs: 5000 });
    assert.deepEqual(JSON.parse(await runner.run({ provider: 'vercel', executable: policy, argv, limits })), { argv: 17, env: ['LANG', 'LC_ALL', 'PATH', 'TZ'], descriptorPipe: false }); await runner.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('descriptor wire bytes are bounded before adapter execution and failures are sanitized', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wordle-am2-bound-'));
  try {
    const source = "#!/usr/bin/node\nprocess.stdout.write('must not execute');\n", policy = await executable(root, source);
    const tool = descriptor(); tool.bundleRoot = `/${'wordle-am2-CANARY'.repeat(300)}`; tool.bundleRealpath = tool.bundleRoot;
    const runner = createG0RetryAdapterRunner({ totalTimeoutMs: 5000, toolBundleValidator: syntheticValidator });
    await assert.rejects(runner.run({ provider: 'vercel', executable: policy, tool, argv, limits }), (error) => error?.code === 'TOOL_DESCRIPTOR_SIZE_INVALID' && error.message === 'TOOL_DESCRIPTOR_SIZE_INVALID');
    await runner.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('post-execution bundle mutation failure is fixed and descriptor content is not disclosed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wordle-am2-change-')), tool = descriptor();
  try {
    const source = "#!/usr/bin/node\nimport{closeSync,readFileSync}from'node:fs';readFileSync(3);closeSync(3);process.stdout.write('private output');\n", policy = await executable(root, source);
    const validator = async ({ betweenSnapshots }) => { await betweenSnapshots(); const error = new Error('TOOL_BUNDLE_CHANGED'); error.code = 'TOOL_BUNDLE_CHANGED'; throw error; };
    const runner = createG0RetryAdapterRunner({ totalTimeoutMs: 5000, toolBundleValidator: validator });
    await assert.rejects(runner.run({ provider: 'vercel', executable: policy, tool, argv, limits }), (error) => error?.code === 'TOOL_BUNDLE_CHANGED' && !error.message.includes('CANARY'));
    await runner.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
