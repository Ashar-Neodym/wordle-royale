import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { ChallengeHub } from '../../components/ChallengeHub';
import { PageFrame } from '../../components/PageFrame';

export const metadata: Metadata = {
  title: 'Same-Puzzle Challenges | Wordle Royale',
  description: 'Create or open an asynchronous browser-local Wordle challenge.',
};

export default function ChallengePage(): ReactElement {
  return <PageFrame showEnvironmentNotice={false}><ChallengeHub /></PageFrame>;
}
