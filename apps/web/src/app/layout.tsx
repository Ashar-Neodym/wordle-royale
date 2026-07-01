import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';
import { cssVariables } from '../lib/tokens';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wordle Royale — Rated word games',
  description: 'Human, game-first Wordle Royale web shell with ranked lobbies and fixture-safe fallback state.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  return (
    <html lang="en">
      <body>
        <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
        {children}
      </body>
    </html>
  );
}
