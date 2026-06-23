export const shareCard = {
  size: {
    square: { width: 1080, height: 1080 },
    story: { width: 1080, height: 1920 },
  },
  bg: '#101827',
  accent: '#F4C542',
  text: { primary: '#F8FAFC', secondary: '#CBD5E1' },
  tile: { size: '56px', gap: '6px' },
  radius: '32px',
  contentPolicy: {
    spoilerSafeByDefault: true,
    allowed: ['productName', 'placement', 'totalScore', 'ratedLabel', 'mmrDelta', 'roundsSolved', 'tilePattern', 'appUrl'],
    blockedWithoutApproval: ['answerWords', 'fullGuessText', 'privateHandles', 'ratingFormula', 'antiCheatStatus'],
  },
} as const;
