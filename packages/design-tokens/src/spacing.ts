export const space = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const size = {
  touch: { min: '44px' },
  tile: { mobile: '52px', web: '58px', compact: '36px' },
  key: { mobile: { height: '48px' }, web: { height: '44px' } },
  appShell: { sidebar: '264px' },
  topBar: { height: '56px' },
} as const;
