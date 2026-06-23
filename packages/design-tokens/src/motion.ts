export const motion = {
  duration: {
    instant: '0ms',
    fast: '120ms',
    normal: '180ms',
    tileFlip: '260ms',
    roundTransition: '400ms',
  },
  easing: {
    standard: 'cubic-bezier(.2,0,0,1)',
    emphasis: 'cubic-bezier(.2,.8,.2,1)',
  },
  reducedMotion: {
    tileFlip: '0ms',
    invalidShake: '0ms',
    countdownPulse: '0ms',
    scoreBurst: '0ms',
    confetti: false,
  },
} as const;
