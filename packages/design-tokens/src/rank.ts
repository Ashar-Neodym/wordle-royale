export const rank = {
  color: {
    rated: { bg: '#2A2210', border: '#F4C542', text: '#FFE8A3', label: 'Rated' },
    unrated: { bg: '#223049', border: '#64748B', text: '#CBD5E1', label: 'Unrated' },
    provisional: { bg: '#102A43', border: '#4F8CFF', text: '#BFDBFE', label: 'Provisional' },
  },
  tier: {
    1: '#A8A29E',
    2: '#CBD5E1',
    3: '#F4C542',
    4: '#4F8CFF',
    5: '#A78BFA',
  },
} as const;

export const score = {
  delta: {
    positive: { bg: '#123524', text: '#45D483', label: 'Rating gained' },
    negative: { bg: '#3A1419', text: '#FF8A98', label: 'Rating lost' },
    neutral: { bg: '#24324A', text: '#CBD5E1', label: 'Rating unchanged' },
  },
} as const;
