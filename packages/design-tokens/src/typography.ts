export const typography = {
  family: {
    display: 'Sora, Space Grotesk, Inter, system-ui, sans-serif',
    body: 'Inter, Geist, system-ui, sans-serif',
    mono: 'Roboto Mono, SFMono-Regular, ui-monospace, monospace',
  },
  size: {
    xs: '12px',
    sm: '14px',
    md: '16px',
    lg: '18px',
    xl: '24px',
    '2xl': '32px',
    '3xl': '44px',
  },
  lineHeight: {
    tight: '1.1',
    normal: '1.45',
    relaxed: '1.6',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  numeric: {
    fontVariantNumeric: 'tabular-nums',
  },
} as const;
