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
      body: 'Use your physical keyboard or the on-screen keyboard. When browser storage is available, your current round and local stats stay in this browser across reloads. A finished result can be copied without revealing the word.',
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
      title: 'Standard scoring',
      body: 'A solved Standard round scores 100 base points, a guess bonus of 60, 50, 40, 25, 10, or 0 points for solving in guesses one through six, and a 0–50 point time bonus based on the remaining round-time ratio, rounded to the nearest point. An unsolved round scores 0. Final standings and server-applied rating results are separate from this points formula.',
    },
    {
      id: 'speed-adjudication',
      title: 'Speed adjudication',
      body: 'Speed is one shared 75-second puzzle with up to six accepted guesses. A forfeit overrides puzzle progress; otherwise a solve beats a failure, then fewer accepted guesses wins, then the server solve time in 100 ms buckets breaks equal-guess solves. Equal solve-time buckets draw. Disconnecting does not pause the clock; failing to become ready before reveal is a no-contest.',
    },
    {
      id: 'fair-play',
      title: 'Fair play',
      body: 'No active match page should expose plaintext answers, answer hashes, salts, or client-authoritative scoring. If authoritative match state is unavailable, ranked pages show that unavailability instead of substituting demo state.',
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
