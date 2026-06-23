import { border } from './border.js';
import { colors } from './color.js';
import { connectionStates } from './connection.js';
import { lobbyStates } from './lobby.js';
import { motion } from './motion.js';
import { rank, score } from './rank.js';
import { radius } from './radius.js';
import { shadow, nativeShadow } from './shadow.js';
import { shareCard } from './share-card.js';
import { size, space } from './spacing.js';
import { tileStates, tileVariants } from './tile.js';
import { typography } from './typography.js';

export const wrTheme = {
  name: 'crown-grid-arena',
  color: colors,
  typography,
  space,
  radius,
  shadow,
  nativeShadow,
  border,
  motion,
  size,
  tile: { states: tileStates, variants: tileVariants },
  rank,
  score,
  lobby: { states: lobbyStates },
  connection: { states: connectionStates },
  shareCard,
} as const;

export const wrThemeVariants = {
  defaultDark: wrTheme,
  colorblind: {
    ...wrTheme,
    name: 'crown-grid-arena-colorblind',
    tile: { states: tileStates, variants: tileVariants, activeVariant: 'colorblind' },
  },
  highContrast: {
    ...wrTheme,
    name: 'crown-grid-arena-high-contrast',
    color: { ...colors, border: { ...colors.border, focus: '#FFFFFF', strong: '#FFFFFF' } },
    tile: { states: tileVariants.highContrast, variants: tileVariants, activeVariant: 'highContrast' },
  },
  reducedMotion: {
    ...wrTheme,
    name: 'crown-grid-arena-reduced-motion',
    motion: { ...motion, duration: { ...motion.duration, tileFlip: '0ms', roundTransition: '0ms' } },
  },
} as const;
