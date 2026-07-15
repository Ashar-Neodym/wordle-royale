import type { Metadata, Viewport } from 'next';

export const APPLICATION_METADATA: Metadata = Object.freeze({
  title: 'Wordle Royale',
  description: 'Rated, server-authoritative word games with live Standard matchmaking.',
  applicationName: 'Wordle Royale',
});

export const APPLICATION_VIEWPORT: Viewport = Object.freeze({
  themeColor: '#769656',
  colorScheme: 'dark',
});
