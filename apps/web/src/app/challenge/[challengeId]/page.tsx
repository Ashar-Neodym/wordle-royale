import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { ChallengeGame, ChallengeUnavailable } from '../../../components/ChallengeGame';
import { PageFrame } from '../../../components/PageFrame';
import { parseChallengeId } from '../../../lib/challenge-id';

export const metadata: Metadata = {
  title: 'Same-Puzzle Challenge | Wordle Royale',
  description: 'Play an asynchronous browser-local Wordle challenge.',
};

type ChallengeRouteProps = Readonly<{ params: Promise<{ challengeId: string }> | { challengeId: string } }>;

export default async function ChallengeRoute({ params }: ChallengeRouteProps): Promise<ReactElement> {
  const { challengeId } = await params;
  const parsed = parseChallengeId(challengeId);
  return <PageFrame showEnvironmentNotice={false}>{parsed.ok
    ? <ChallengeGame challengeId={parsed.challengeId} />
    : <ChallengeUnavailable />}</PageFrame>;
}
