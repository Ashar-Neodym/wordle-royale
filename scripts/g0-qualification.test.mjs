import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseManifest, validateManifest, canonicalJson } from './g0-qualification-core.mjs';

const path = new URL('../docs/wordle-royale-g0-provisioning-manifest.yaml', import.meta.url);
const source = await readFile(path,'utf8');
const valid = () => parseManifest(source);
const rejects = (mutate, code) => assert.throws(() => validateManifest(mutate(valid())), (error) => error.code === code);

test('strict shipped manifest qualifies locally without claiming a source SHA', () => { const manifest=validateManifest(valid()); assert.equal(manifest.status,'local_qualification_required'); assert.equal(manifest.sourceSha,null); });
test('canonical JSON is key-order deterministic', () => assert.equal(canonicalJson({z:1,a:{y:2,x:3}}),'{"a":{"x":3,"y":2},"z":1}'));
test('parser rejects duplicate fields', () => assert.throws(() => parseManifest(source.replace('status: local_qualification_required','status: local_qualification_required\nstatus: local_qualification_required')), /MANIFEST_DUPLICATE_KEY/u));
test('parser rejects aliases and unsupported YAML', () => assert.throws(() => parseManifest(source.replace('principal: ashar','principal: &owner ashar')), /MANIFEST_UNSUPPORTED_YAML/u));
test('unknown top-level fields fail closed', () => { const m=valid(); m.futurePolicy=true; assert.throws(()=>validateManifest(m),/MANIFEST_TOP_LEVEL_SCHEMA_INVALID/u); });
test('stale Wave AD status is rejected', () => rejects((m)=>(m.status='blocked_pending_wave_ad_tooling',m),'MANIFEST_STATUS_INVALID'));
test('tracked source SHA is rejected as self-referential', () => rejects((m)=>(m.sourceSha='a'.repeat(40),m),'MANIFEST_SOURCE_MUST_BE_UNQUALIFIED'));
test('approval fields remain null', () => rejects((m)=>(m.approval.approvalId='secret-approval',m),'APPROVAL_NOT_NULL'));
test('decimal-safe cap rejects tiny overage', () => rejects((m)=>(m.cost.railwayCurrentBillingPeriodUsageApprox='5.0001',m),'COST_POLICY_INVALID'));
test('decimal parser rejects exponent notation', () => rejects((m)=>(m.cost.railwayCurrentBillingPeriodUsageApprox='1e0',m),'COST_INVALID'));
test('paid or overage approvals fail closed', () => rejects((m)=>(m.cost.overageApproved=true,m),'COST_POLICY_INVALID'));
test('preview identity drift is rejected', () => rejects((m)=>(m.previewPreservation.railway.projectId='different-preview-id',m),'PREVIEW_PRESERVATION_INVALID'));
test('preview mutation is rejected', () => rejects((m)=>(m.previewPreservation.mutationAllowed=true,m),'PREVIEW_PRESERVATION_INVALID'));
test('nonzero hosted action is rejected', () => rejects((m)=>(m.productionShells.railway.deployments='1',m),'ZERO_ACTION_POLICY_INVALID'));
test('G2 backup blocker cannot be downgraded', () => rejects((m)=>(m.blockingPrerequisites[2].state='resolved',m),'BLOCKER_CLASSIFICATION_INVALID'));
test('PLAN_AND_COST human fence cannot be removed', () => rejects((m)=>(m.blockingPrerequisites[3].state='resolved_by_wave_ad',m),'BLOCKER_CLASSIFICATION_INVALID'));
test('unknown blocker fields are rejected', () => rejects((m)=>(m.blockingPrerequisites[0].evidence='trust me',m),'BLOCKER_SCHEMA_INVALID'));
test('hosted mutation authorization is impossible', () => rejects((m)=>(m.nextGate.hostedMutationAllowed=true,m),'HOSTED_MUTATION_FORBIDDEN'));
test('public origins and network actions remain empty', () => rejects((m)=>(m.network.generatedDomainsAllowed=true,m),'NETWORK_POLICY_INVALID'));
