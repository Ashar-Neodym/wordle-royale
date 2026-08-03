import assert from 'node:assert/strict';
import test from 'node:test';
import {
  API_SUPPORTED_WEB_AUTHORITY_IDS,
  MAX_SUPPORTED_WEB_AUTHORITY_IDS,
  RUNTIME_COMPATIBILITY_SCHEMA_VERSION,
  WEB_API_AUTHORITY_V1,
  WEB_REQUIRED_API_AUTHORITY_ID,
} from './constants.ts';
import { runtimeCompatibilityEnvelopeSchema, runtimeCompatibilityPayloadSchema } from './schemas.ts';

const validPayload = {
  schemaVersion: RUNTIME_COMPATIBILITY_SCHEMA_VERSION,
  service: 'wordle-royale-api',
  environment: 'preview',
  revision: 'd452d5111cac3d9fa9f9a61e375102ea7760f6a2',
  supportedWebAuthorityIds: [...API_SUPPORTED_WEB_AUTHORITY_IDS],
};

test('exports the shared v1 web/API authority agreement', () => {
  assert.equal(WEB_API_AUTHORITY_V1, 'wordle-royale/web-api-authority/1');
  assert.equal(WEB_REQUIRED_API_AUTHORITY_ID, WEB_API_AUTHORITY_V1);
  assert.deepEqual(API_SUPPORTED_WEB_AUTHORITY_IDS, [WEB_REQUIRED_API_AUTHORITY_ID]);
  assert.deepEqual(runtimeCompatibilityPayloadSchema.parse(validPayload), validPayload);
  assert.deepEqual(runtimeCompatibilityEnvelopeSchema.parse({ data: validPayload, error: null, requestId: 'request-1' }), {
    data: validPayload,
    error: null,
    requestId: 'request-1',
  });
});

test('strictly rejects extras and wrong schema, service, environment, or revision values', () => {
  const invalidVariants = [
    { ...validPayload, extra: true },
    { ...validPayload, schemaVersion: 'wordle-royale-runtime-compatibility/v2' },
    { ...validPayload, service: 'wordle-royale-web' },
    { ...validPayload, environment: '' },
    { ...validPayload, environment: 'Preview Environment' },
    { ...validPayload, environment: 'p'.repeat(65) },
    { ...validPayload, revision: 'not-a-deployment-revision' },
    { ...validPayload, revision: 'abc123' },
  ];

  for (const candidate of invalidVariants) {
    assert.equal(runtimeCompatibilityPayloadSchema.safeParse(candidate).success, false);
  }
});

test('requires a nonempty bounded unique array of canonical web authority IDs', () => {
  const invalidIdSets = [
    [],
    [WEB_API_AUTHORITY_V1, WEB_API_AUTHORITY_V1],
    Array.from({ length: MAX_SUPPORTED_WEB_AUTHORITY_IDS + 1 }, (_, index) => `wordle-royale/web-api-authority/${index + 1}`),
    ['web-api-authority/1'],
    ['wordle-royale/Web-api-authority/1'],
    ['wordle-royale/web_api_authority/1'],
    ['wordle-royale/web-api-authority/0'],
    [`wordle-royale/${'a'.repeat(128)}-authority/1`],
  ];

  for (const supportedWebAuthorityIds of invalidIdSets) {
    assert.equal(runtimeCompatibilityPayloadSchema.safeParse({ ...validPayload, supportedWebAuthorityIds }).success, false);
  }
});
