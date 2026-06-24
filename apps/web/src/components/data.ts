import { fixtureUsers } from '../lib/fixtures';

export const userById = (userId: string) =>
  Object.values(fixtureUsers).find((user) => user.id === userId) ?? {
    id: userId,
    handle: userId,
    displayName: userId,
    avatarColor: '#64748B',
    rating: 1500,
    provisional: true,
  };

export const formatState = (state: string) => state.replaceAll('_', ' ');
