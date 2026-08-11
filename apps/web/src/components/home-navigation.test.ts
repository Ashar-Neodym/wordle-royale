import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { siteNavModel } from './site-nav-model.ts';

const homeSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const disabledHomeSource = readFileSync(new URL('./DisabledHome.tsx', import.meta.url), 'utf8');
const navSource = readFileSync(new URL('./SiteNav.tsx', import.meta.url), 'utf8');

const disabled = { appEnvironment: 'production', mode: 'disabled', registrationMode: null } as const;
const preview = { appEnvironment: 'preview', mode: 'preview_demo', registrationMode: null } as const;
const durable = { appEnvironment: 'production', mode: 'durable', registrationMode: 'closed' } as const;

describe('mode-aware Home and navigation boundaries', () => {
  it('models disabled desktop and mobile navigation with local Challenges', () => {
    const model = siteNavModel(disabled);
    assert.deepEqual(model.desktop, [
      { kind: 'link', href: '/practice', label: 'Practice' },
      { kind: 'link', href: '/challenge', label: 'Challenges' },
      { kind: 'link', href: '/learn/rules', label: 'Rules' },
      { kind: 'link', href: '/settings', label: 'Settings' },
    ]);
    assert.deepEqual(model.mobile, [
      { href: '/practice', label: 'Practice' },
      { href: '/challenge', label: 'Challenges', note: 'async · local · unrated' },
      { href: '/learn/rules', label: 'Rules' },
      { href: '/settings', label: 'Settings', note: 'local display preferences' },
    ]);
  });

  it('keeps every pre-existing enabled desktop and mobile link, label, note, order, and account treatment', () => {
    const expectedMobile = [
      { href: '/practice', label: 'Practice' },
      { href: '/challenge', label: 'Challenges', note: 'async · local · unrated' },
      { href: '/play', label: 'Play' },
      { href: '/lobbies', label: 'Lobbies' },
      { href: '/leaderboard', label: 'Ratings' },
      { href: '/profile', label: 'Profile' },
      { href: '/account', label: 'Account' },
      { href: '/learn/rules', label: 'Rules' },
      { href: '/history', label: 'History' },
      { href: '/settings', label: 'Settings', note: 'local display preferences' },
      { href: '/server', label: 'Server' },
    ];
    const commonDesktop = [
      { kind: 'link', href: '/practice', label: 'Practice' },
      { kind: 'link', href: '/challenge', label: 'Challenges' },
      { kind: 'menu', label: 'Play', links: [
        { href: '/practice', label: 'Practice', note: 'guest · not rated' },
        { href: '/challenge', label: 'Challenges', note: 'async · local · unrated' },
        { href: '/play', label: 'Play rated', note: 'board and match' },
        { href: '/lobbies?intent=create', label: 'Create lobby', note: 'rated room' },
        { href: '/lobbies?intent=join', label: 'Join by code', note: 'room code' },
      ] },
      { kind: 'link', href: '/lobbies', label: 'Lobbies' },
      { kind: 'link', href: '/leaderboard', label: 'Leaderboard' },
      { kind: 'menu', label: 'Learn', links: [
        { href: '/learn/rules', label: 'Rules', note: 'how it works' },
        { href: '/learn/rules#scoring', label: 'Scoring', note: 'points and rating' },
        { href: '/learn/rules#fair-play', label: 'Fair play', note: 'spoiler safe' },
      ] },
    ];
    assert.deepEqual(siteNavModel(preview), {
      desktop: [
        ...commonDesktop,
        { kind: 'menu', label: 'Profile', links: [
          { href: '/account', label: 'Account', note: 'temporary demo session' },
          { href: '/profile', label: 'My profile', note: 'mode ratings' },
          { href: '/history', label: 'Match history', note: 'rated games' },
          { href: '/settings', label: 'Settings', note: 'local display preferences' },
        ] },
        { kind: 'account', href: '/account', label: 'Demo session' },
        { kind: 'link', href: '/server', label: 'Server' },
      ],
      mobile: expectedMobile,
    });
    assert.deepEqual(siteNavModel(durable), {
      desktop: [
        ...commonDesktop,
        { kind: 'menu', label: 'Profile', links: [
          { href: '/account', label: 'Account', note: 'sign in and session' },
          { href: '/profile', label: 'My profile', note: 'mode ratings' },
          { href: '/history', label: 'Match history', note: 'rated games' },
          { href: '/settings', label: 'Settings', note: 'local display preferences' },
        ] },
        { kind: 'account', href: '/account', label: 'Account' },
        { kind: 'link', href: '/server', label: 'Server' },
      ],
      mobile: expectedMobile,
    });
  });

  it('routes Home through the strict resolver and keeps query input out of mode selection', () => {
    assert.match(homeSource, /resolveHomePresentation\(requireAuthPresentationConfiguration, getWebApiSnapshot\)/);
    assert.doesNotMatch(homeSource, /searchParams|URLSearchParams|query/);
  });

  it('keeps disabled Home useful, local, and free of operational account/server surfaces', () => {
    for (const copy of [
      'Start practice', 'Rules', 'What you get', 'How to play', 'new random word each round', 'six guesses',
      'correct, present, or absent', 'When browser storage is available, progress and stats stay in this browser', 'Local and not rated',
      'No account or API request',
    ]) assert.match(disabledHomeSource, new RegExp(copy, 'i'));
    assert.doesNotMatch(disabledHomeSource, /lobb|ranked|leaderboard|profile|account action|server status/i);
    assert.doesNotMatch(disabledHomeSource, /getWebApiSnapshot|api-client|fetch\s*\(/);
    assert.match(navSource, /siteNavModel\(presentation\)/);
  });
});
