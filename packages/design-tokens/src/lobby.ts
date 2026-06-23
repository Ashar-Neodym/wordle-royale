export type LobbyUiState =
  | 'created'
  | 'waiting'
  | 'ready'
  | 'starting'
  | 'in_progress'
  | 'completed'
  | 'abandoned'
  | 'cancelled'
  | 'expired'
  | 'full'
  | 'locked'
  | 'host_left'
  | 'settings_changed';

export type StateBadgeToken = { bg: string; border: string; text: string; label: string; icon: 'none' | 'check' | 'clock' | 'play' | 'error' | 'lock' | 'crown' | 'settings' };

export const lobbyStates = {
  created: { bg: '#172033', border: '#4F8CFF', text: '#BFDBFE', label: 'Created', icon: 'none' },
  waiting: { bg: '#172033', border: '#4F8CFF', text: '#BFDBFE', label: 'Waiting', icon: 'clock' },
  ready: { bg: '#123524', border: '#2FA66A', text: '#A7F3D0', label: 'Ready', icon: 'check' },
  starting: { bg: '#2A2210', border: '#F4C542', text: '#FFE8A3', label: 'Starting', icon: 'play' },
  in_progress: { bg: '#102A43', border: '#4F8CFF', text: '#BFDBFE', label: 'In progress', icon: 'play' },
  completed: { bg: '#24324A', border: '#64748B', text: '#CBD5E1', label: 'Completed', icon: 'check' },
  abandoned: { bg: '#3A1419', border: '#E04F5F', text: '#FCA5A5', label: 'Abandoned', icon: 'error' },
  cancelled: { bg: '#3A1419', border: '#E04F5F', text: '#FCA5A5', label: 'Cancelled', icon: 'error' },
  expired: { bg: '#3A2A12', border: '#D89B2B', text: '#FFE3A3', label: 'Expired', icon: 'clock' },
  full: { bg: '#3A2A12', border: '#D89B2B', text: '#FFE3A3', label: 'Full', icon: 'error' },
  locked: { bg: '#24324A', border: '#64748B', text: '#CBD5E1', label: 'Locked', icon: 'lock' },
  host_left: { bg: '#3A2A12', border: '#D89B2B', text: '#FFE3A3', label: 'Host transferred', icon: 'crown' },
  settings_changed: { bg: '#102A43', border: '#4F8CFF', text: '#BFDBFE', label: 'Settings changed', icon: 'settings' },
} as const satisfies Record<LobbyUiState, StateBadgeToken>;
