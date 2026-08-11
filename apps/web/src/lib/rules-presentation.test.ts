import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { requireAuthPresentationConfiguration } from './auth-presentation.ts';
import { resolveRulesPresentation } from './rules-presentation.ts';

const rulesPageSource = readFileSync(new URL('../app/learn/rules/page.tsx', import.meta.url), 'utf8');
const disabled = { appEnvironment: 'production', mode: 'disabled', registrationMode: null } as const;
const preview = { appEnvironment: 'preview', mode: 'preview_demo', registrationMode: null } as const;
const durable = { appEnvironment: 'production', mode: 'durable', registrationMode: 'closed' } as const;

describe('Rules presentation resolver', () => {
  it('makes disabled production concise, local, and Practice-first despite hostile query-shaped input', () => {
    for (const hostileQuery of ['?mode=durable', '?WORDLE_ACCOUNT_MODE=preview_demo', '?mode=disabled&mode=durable']) {
      void hostileQuery;
      const rules = resolveRulesPresentation(() => disabled);
      assert.equal(rules.kind, 'practice');
      assert.equal(rules.title, 'Practice rules');
      assert.deepEqual(rules.actions, [
        { href: '/practice', label: 'Start practice', emphasis: 'primary' },
        { href: '/', label: 'Back home', emphasis: 'secondary' },
      ]);
      const copy = [rules.introduction, ...rules.articles.flatMap((article) => [article.title, article.body])].join(' ');
      for (const phrase of [
        'six tries', 'valid five-letter word', 'Correct', 'present', 'absent', 'duplicate-letter feedback',
        'physical keyboard', 'on-screen keyboard', 'across reloads', 'local stats', 'copied without revealing the word',
      ]) assert.match(copy, new RegExp(phrase, 'i'));
      assert.doesNotMatch(copy, /rated lobby|scoring and ratings|server-authoritative|fixture\/demo/i);
      assert.doesNotMatch(rules.actions.map((action) => action.href).join(' '), /play|lobbies/);
    }
  });

  it('preserves ranked scoring and fair-play guidance in preview demo and durable modes', () => {
    for (const presentation of [preview, durable]) {
      const rules = resolveRulesPresentation(() => presentation);
      assert.equal(rules.kind, 'ranked');
      assert.equal(rules.title, 'Rules and fair play');
      assert.deepEqual(rules.actions, [
        { href: '/play', label: 'Play rated', emphasis: 'primary' },
        { href: '/lobbies', label: 'Find lobby', emphasis: 'secondary' },
      ]);
      assert.deepEqual(rules.articles.map((article) => article.id).filter(Boolean), ['scoring', 'speed-adjudication', 'fair-play']);
      const copy = [rules.introduction, ...rules.articles.flatMap((article) => [article.title, article.body])].join(' ');
      for (const phrase of [
        'rated lobby', 'server state', 'valid five-letter guesses', '100 base points', '60, 50, 40, 25, 10, or 0',
        '75-second puzzle', '100 ms buckets', 'no-contest', 'plaintext answers', 'client-authoritative scoring', 'instead of substituting demo state',
      ]) assert.match(copy, new RegExp(phrase, 'i'));
    }
  });

  it('fails before choosing copy when strict deployment presentation is invalid', () => {
    let resolutions = 0;
    assert.throws(
      () => resolveRulesPresentation(() => {
        resolutions += 1;
        return requireAuthPresentationConfiguration({
          WORDLE_WEB_ENV: 'production',
          WORDLE_ACCOUNT_MODE: 'disabled',
          WORDLE_REGISTRATION_MODE: 'open',
        });
      }),
      /Invalid web auth presentation configuration: Disabled production must not provide a registration mode/,
    );
    assert.equal(resolutions, 1);
  });

  it('routes the page through the strict resolver and does not inspect query strings', () => {
    assert.match(rulesPageSource, /resolveRulesPresentation\(requireAuthPresentationConfiguration\)/);
    assert.doesNotMatch(rulesPageSource, /searchParams|URLSearchParams|query/);
    assert.doesNotMatch(rulesPageSource, /getWebApiSnapshot|api-client|fetch\s*\(/);
  });
});
