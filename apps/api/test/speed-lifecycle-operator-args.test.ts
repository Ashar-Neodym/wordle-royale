import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOperatorArgs } from '../scripts/speed-lifecycle-operator-args.ts';

const SHA = 'a'.repeat(40);
const base = [
  'verify', '--project-id', 'project-1', '--environment-id', 'environment-1', '--service-id', 'service-1',
  '--deployment-id', 'deployment-1', '--expected-release', 'railway:deployment:deployment-1',
  '--expected-artifact', `git:${SHA}`, '--expected-replicas', '2', '--expected-phase', 'v1_open',
  '--expected-generation', '1', '--health-url', 'https://api.example.test', '--json',
];

function code(args: string[]): string {
  try { parseOperatorArgs(args); return 'accepted'; }
  catch (error) { return (error as { code?: string }).code ?? 'unknown'; }
}

describe('Ticket 195 strict operator argument parser', () => {
  it('accepts only the complete canonical dry-run input', () => {
    const parsed = parseOperatorArgs(base);
    assert.equal(parsed.command, 'verify');
    assert.equal(parsed.apply, false);
    assert.equal(parsed.target.healthUrl, 'https://api.example.test');
  });

  it('rejects unknown, duplicate, secret-shaped, control-character, credential, and inapplicable arguments', () => {
    const cases = [
      [...base, '--database-url', 'postgresql://secret'],
      [...base, '--token', 'secret'],
      [...base, '--json'],
      base.map((value) => value === 'project-1' ? 'project-1\nansi' : value),
      base.map((value) => value === 'https://api.example.test' ? 'https://user:secret@api.example.test' : value),
      [...base, '--approval-ref', 'ticket-195'],
      ['verify', ...base.slice(1), '--apply'],
    ];
    assert.deepEqual(cases.map(code), [
      'argument_invalid', 'argument_invalid', 'argument_invalid', 'argument_invalid',
      'argument_invalid', 'argument_invalid', 'command_unsupported',
    ]);
  });
});
