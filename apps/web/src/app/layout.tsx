import type { ReactElement, ReactNode } from 'react';
import { APPLICATION_METADATA, APPLICATION_VIEWPORT } from '../lib/application-metadata';
import { cssVariables } from '../lib/tokens';
import './globals.css';

export const metadata = APPLICATION_METADATA;
export const viewport = APPLICATION_VIEWPORT;

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
