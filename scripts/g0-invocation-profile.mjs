import { createHash } from 'node:crypto';
import { canonicalProviderToolJson } from './g0-provider-tool-bundle.mjs';

export const G0_INVOCATION_PROFILE_SCHEMA = 'wordle-royale-g0-invocation-profile/v1';
const MAX_JSON_DEPTH = 16;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys, code) => {
  if (!plain(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail(code);
};
const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
};

export function validateInvocationProfileOutputSchema(schema, depth = 1) {
  if (depth > MAX_JSON_DEPTH || !plain(schema) || typeof schema.type !== 'string') fail('ADAPTER_PROFILE_INVALID');
  if (schema.type === 'object') {
    exact(schema, ['type', 'fields'], 'ADAPTER_PROFILE_INVALID');
    if (!plain(schema.fields) || Object.keys(schema.fields).length < 1) fail('ADAPTER_PROFILE_INVALID');
    for (const child of Object.values(schema.fields)) validateInvocationProfileOutputSchema(child, depth + 1);
    return;
  }
  if (schema.type === 'array') {
    exact(schema, ['type', 'items', 'maxItems'], 'ADAPTER_PROFILE_INVALID');
    if (!Number.isInteger(schema.maxItems) || schema.maxItems < 0 || schema.maxItems > 10_000) fail('ADAPTER_PROFILE_INVALID');
    validateInvocationProfileOutputSchema(schema.items, depth + 1); return;
  }
  if (schema.type === 'string') {
    const keys = Object.keys(schema).sort().join('|');
    if (!['enum|type', 'maxLength|pattern|type'].includes(keys)) fail('ADAPTER_PROFILE_INVALID');
    if (schema.enum) {
      if (!Array.isArray(schema.enum) || schema.enum.length < 1 || schema.enum.some((x) => typeof x !== 'string' || x.includes('\0'))) fail('ADAPTER_PROFILE_INVALID');
    } else {
      if (!Number.isInteger(schema.maxLength) || schema.maxLength < 0 || schema.maxLength > 1_048_576 || typeof schema.pattern !== 'string' || schema.pattern.length > 1024) fail('ADAPTER_PROFILE_INVALID');
      try { new RegExp(schema.pattern, 'u'); } catch { fail('ADAPTER_PROFILE_INVALID'); }
    }
    return;
  }
  if (schema.type === 'boolean') { exact(schema, ['type'], 'ADAPTER_PROFILE_INVALID'); return; }
  if (schema.type === 'integer') {
    exact(schema, ['type', 'min', 'max'], 'ADAPTER_PROFILE_INVALID');
    if (!Number.isSafeInteger(schema.min) || !Number.isSafeInteger(schema.max) || schema.min > schema.max) fail('ADAPTER_PROFILE_INVALID'); return;
  }
  if (schema.type === 'null') { exact(schema, ['type'], 'ADAPTER_PROFILE_INVALID'); return; }
  fail('ADAPTER_PROFILE_INVALID');
}

export function validateInvocationProfileOperations(operations) {
  if (!plain(operations) || Object.keys(operations).length < 1) fail('ADAPTER_PROFILE_INVALID');
  for (const [operationId, operation] of Object.entries(operations)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/u.test(operationId)) fail('ADAPTER_PROFILE_INVALID');
    exact(operation, ['runtime', 'args', 'schema', 'resultPolicy'], 'ADAPTER_PROFILE_INVALID');
    if (!['node_entrypoint', 'native_binary'].includes(operation.runtime) || !Array.isArray(operation.args) || operation.args.length > 64 || operation.args.some((x) => typeof x !== 'string' || x.length > 4096 || x.includes('\0'))) fail('ADAPTER_PROFILE_INVALID');
    if (!['json_empty_stderr', 'vercel_json_banner', 'vercel_billing_404', 'supabase_legacy_auth_required'].includes(operation.resultPolicy)) fail('ADAPTER_PROFILE_INVALID');
    if (operation.resultPolicy.endsWith('404') || operation.resultPolicy.endsWith('required')) {
      if (operation.schema !== null) fail('ADAPTER_PROFILE_INVALID');
    } else validateInvocationProfileOutputSchema(operation.schema);
  }
  return deepFreeze(operations);
}

export function canonicalInvocationProfileDocument(invocationProfile, operations) {
  if (typeof invocationProfile !== 'string' || invocationProfile.length < 1 || invocationProfile.length > 200) fail('ADAPTER_PROFILE_INVALID');
  const profile = validateInvocationProfileOperations(operations);
  return canonicalProviderToolJson({ schemaVersion: G0_INVOCATION_PROFILE_SCHEMA, invocationProfile, operations: profile });
}

export function hashInvocationProfile(invocationProfile, operations) {
  return `sha256:${createHash('sha256').update(`${canonicalInvocationProfileDocument(invocationProfile, operations)}\n`, 'utf8').digest('hex')}`;
}
