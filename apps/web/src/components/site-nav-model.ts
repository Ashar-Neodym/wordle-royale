import type { AuthPresentationPublic } from '../lib/auth-presentation.ts';

export type NavLinkModel = Readonly<{ href: string; label: string; note?: string }>;
export type DesktopNavItem =
  | Readonly<{ kind: 'link'; href: string; label: string }>
  | Readonly<{ kind: 'menu'; label: string; links: readonly NavLinkModel[] }>
  | Readonly<{ kind: 'account'; href: '/account'; label: string }>;

export type SiteNavModel = Readonly<{
  desktop: readonly DesktopNavItem[];
  mobile: readonly NavLinkModel[];
}>;

const playLinks: readonly NavLinkModel[] = [
  { href: '/practice', label: 'Practice', note: 'guest · not rated' },
  { href: '/play', label: 'Play rated', note: 'board and match' },
  { href: '/lobbies?intent=create', label: 'Create lobby', note: 'rated room' },
  { href: '/lobbies?intent=join', label: 'Join by code', note: 'room code' },
];

const learnLinks: readonly NavLinkModel[] = [
  { href: '/learn/rules', label: 'Rules', note: 'how it works' },
  { href: '/learn/rules#scoring', label: 'Scoring', note: 'points and rating' },
  { href: '/learn/rules#fair-play', label: 'Fair play', note: 'spoiler safe' },
];

function profileLinks(presentation: AuthPresentationPublic): readonly NavLinkModel[] {
  const accountNote = presentation.mode === 'preview_demo' ? 'temporary demo session' : 'sign in and session';
  return [
    { href: '/account', label: 'Account', note: accountNote },
    { href: '/profile', label: 'My profile', note: 'mode ratings' },
    { href: '/history', label: 'Match history', note: 'rated games' },
    { href: '/settings', label: 'Settings', note: presentation.mode === 'preview_demo' ? 'preview account' : 'preferences' },
  ];
}

export function siteNavModel(presentation: AuthPresentationPublic): SiteNavModel {
  if (presentation.mode === 'disabled') return {
    desktop: [
      { kind: 'link', href: '/practice', label: 'Practice' },
      { kind: 'link', href: '/learn/rules', label: 'Rules' },
    ],
    mobile: [
      { href: '/practice', label: 'Practice' },
      { href: '/learn/rules', label: 'Rules' },
    ],
  };

  return {
    desktop: [
      { kind: 'link', href: '/practice', label: 'Practice' },
      { kind: 'menu', label: 'Play', links: playLinks },
      { kind: 'link', href: '/lobbies', label: 'Lobbies' },
      { kind: 'link', href: '/leaderboard', label: 'Leaderboard' },
      { kind: 'menu', label: 'Learn', links: learnLinks },
      { kind: 'menu', label: 'Profile', links: profileLinks(presentation) },
      { kind: 'account', href: '/account', label: presentation.mode === 'preview_demo' ? 'Demo session' : 'Account' },
      { kind: 'link', href: '/server', label: 'Server' },
    ],
    mobile: [
      { href: '/practice', label: 'Practice' },
      { href: '/play', label: 'Play' },
      { href: '/lobbies', label: 'Lobbies' },
      { href: '/leaderboard', label: 'Ratings' },
      { href: '/profile', label: 'Profile' },
      { href: '/account', label: 'Account' },
      { href: '/learn/rules', label: 'Rules' },
      { href: '/history', label: 'History' },
      { href: '/settings', label: 'Settings' },
      { href: '/server', label: 'Server' },
    ],
  };
}
