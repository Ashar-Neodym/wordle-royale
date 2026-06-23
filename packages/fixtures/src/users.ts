import type { FixtureUser } from './types.js';

export const fixtureUsers = {
  ashar: { id: 'user_ashar', handle: 'ashar', displayName: 'Ashar', avatarColor: '#F4C542', rating: 1500, provisional: true },
  luna: { id: 'user_luna', handle: 'luna', displayName: 'Luna', avatarColor: '#4F8CFF', rating: 1532, provisional: false },
  ruby: { id: 'user_ruby', handle: 'ruby', displayName: 'Ruby', avatarColor: '#E04F5F', rating: 1478, provisional: false },
  freya: { id: 'user_freya', handle: 'freya', displayName: 'Freya', avatarColor: '#2FA66A', rating: 1610, provisional: false },
} as const satisfies Record<string, FixtureUser>;
