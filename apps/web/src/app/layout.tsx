import type { ReactElement, ReactNode } from 'react';
import Script from 'next/script';
import { APPLICATION_METADATA, APPLICATION_VIEWPORT } from '../lib/application-metadata';
import { DEFAULT_DISPLAY_PREFERENCES, displayPreferencesBootstrapScript } from '../lib/display-preferences';
import { cssVariables } from '../lib/tokens';
import './globals.css';

export const metadata = APPLICATION_METADATA;
export const viewport = APPLICATION_VIEWPORT;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  return (
    <html
      lang="en"
      data-wr-motion={DEFAULT_DISPLAY_PREFERENCES.motion}
      data-wr-contrast={DEFAULT_DISPLAY_PREFERENCES.contrast}
      suppressHydrationWarning
    >
      <body>
        <Script
          id="wr-display-preferences-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: displayPreferencesBootstrapScript() }}
        />
        <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
        {children}
      </body>
    </html>
  );
}
