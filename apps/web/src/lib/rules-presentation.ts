import type { AuthPresentationPublic } from './auth-presentation.ts';

export type RulesArticle = Readonly<{
  id?: string;
  title: string;
  body: string;
}>;

export type RulesAction = Readonly<{
  href: string;
  label: string;
  emphasis: 'primary' | 'secondary';
}>;

export type RulesPresentation = Readonly<{
  kind: 'practice' | 'ranked';
  eyebrow: string;
  title: string;
  introduction: string;
  rulesLabel: string;
  articles: readonly RulesArticle[];
  actions: readonly RulesAction[];
}>;

const PRACTICE_RULES: RulesPresentation = {
  kind: 'practice',
  eyebrow: 'Learn',
  title: 'Practice rules',
  introduction: 'Play a complete Wordle round locally in your browser—no account, lobby, or rating required.',
  rulesLabel: 'Practice rules',
  articles: [
    {
      title: 'Six guesses',
      body: 'Guess the word in six tries. Every submitted guess must be a valid five-letter word.',
    },
    {
      title: 'Read the feedback',
      body: 'Correct letters are in the right spot, present letters belong elsewhere, and absent letters are not available. Repeated letters are scored against the answer’s available occurrences, so duplicate-letter feedback stays accurate.',
    },
    {
      title: 'Play locally',
      body: 'Use your physical keyboard or the on-screen keyboard. Your current round and local stats stay in this browser across reloads, and a finished result can be copied without revealing the word.',
    },
  ],
  actions: [
    { href: '/practice', label: 'Start practice', emphasis: 'primary' },
    { href: '/', label: 'Back home', emphasis: 'secondary' },
  ],
};

const RANKED_RULES: RulesPresentation = {
  kind: 'ranked',
  eyebrow: 'Learn',
  title: 'Rules and fair play',
  introduction: 'Short rules for ranked Wordle Royale. The game stays server-authoritative and active-play spoilers stay hidden.',
  rulesLabel: 'Wordle Royale rules',
  articles: [
    {
      title: 'Match basics',
      body: 'Join or create a rated lobby, wait for enough players, then start a ranked match. Each round uses server state so players see feedback without receiving the answer.',
    },
    {
      title: 'Guessing',
      body: 'Submit valid five-letter guesses. Feedback marks correct, present, and absent letters. The UI sends guesses to the server; it does not score active rounds on the client.',
    },
    {
      id: 'scoring',
      title: 'Scoring and ratings',
      body: 'Faster solves, fewer guesses, and final standings feed the ranked result. Rating rows are marked provisional until enough games are played.',
    },
    {
      id: 'fair-play',
      title: 'Fair play',
      body: 'No active match page should expose plaintext answers, answer hashes, salts, or client-authoritative scoring. Fixture/demo state is labeled when the local API is offline.',
    },
  ],
  actions: [
    { href: '/play', label: 'Play rated', emphasis: 'primary' },
    { href: '/lobbies', label: 'Find lobby', emphasis: 'secondary' },
  ],
};

/** Resolve strict deployment presentation before selecting user-visible Rules copy. */
export function resolveRulesPresentation(
  resolvePresentation: () => AuthPresentationPublic,
): RulesPresentation {
  const presentation = resolvePresentation();
  return presentation.mode === 'disabled' ? PRACTICE_RULES : RANKED_RULES;
}
