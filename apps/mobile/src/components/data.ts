import { fixtureUsers } from '../lib/fixtures';

type FixtureUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarColor: string;
  rating: number;
  provisional: boolean;
};

const fallbackUser = (userId: string): FixtureUser => ({
  id: userId,
  handle: userId,
  displayName: userId,
  avatarColor: '#64748B',
  rating: 1500,
  provisional: true,
});

export const userById = (userId: string): FixtureUser =>
  (Object.values(fixtureUsers) as FixtureUser[]).find((user) => user.id === userId) ?? fallbackUser(userId);

export const formatState = (state: string): string => state.replaceAll('_', ' ');
