import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { PageFrame } from '../../components/PageFrame';
import { PracticeGame } from '../../components/PracticeGame';

export const metadata: Metadata = {
  title: 'Wordle Practice | Wordle Royale',
  description: 'Play a complete guest Wordle game without an account.',
};

export default function PracticePage(): ReactElement {
  return (
    <PageFrame showEnvironmentNotice={false}>
      <PracticeGame />
    </PageFrame>
  );
}
