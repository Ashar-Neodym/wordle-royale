export const shadow = {
  none: 'none',
  1: '0 1px 2px rgba(0,0,0,.25)',
  2: '0 8px 24px rgba(0,0,0,.28)',
  3: '0 18px 48px rgba(0,0,0,.35)',
  goldGlow: '0 0 0 1px rgba(244,197,66,.45), 0 0 24px rgba(244,197,66,.20)',
  focus: '0 0 0 3px rgba(79,140,255,.42)',
} as const;

export const nativeShadow = {
  none: { elevation: 0 },
  1: { elevation: 1, shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  2: { elevation: 3, shadowColor: '#000000', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  3: { elevation: 6, shadowColor: '#000000', shadowOpacity: 0.35, shadowRadius: 48, shadowOffset: { width: 0, height: 18 } },
  goldGlow: { elevation: 4, shadowColor: '#F4C542', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
} as const;
