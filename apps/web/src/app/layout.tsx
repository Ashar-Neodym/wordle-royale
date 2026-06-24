import type { Metadata } from 'next';
import { cssVariables } from '../lib/tokens';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wordle Royale — Crown Grid Arena',
  description: 'Fixture-driven Wordle Royale web shell using shared design tokens.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
        {children}
      </body>
    </html>
  );
}
