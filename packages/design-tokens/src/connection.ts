export type ConnectionUiState = 'live' | 'unstable' | 'reconnecting' | 'resyncing' | 'reconnected' | 'offline' | 'failed';

export type ConnectionToken = {
  bg: string;
  border: string;
  text: string;
  label: string;
  icon: 'signal' | 'warning' | 'spinner' | 'sync' | 'check' | 'offline' | 'error';
  ariaLive: 'off' | 'polite' | 'assertive';
};

export const connectionStates = {
  live: { bg: '#123524', border: '#2FA66A', text: '#A7F3D0', label: 'Live', icon: 'signal', ariaLive: 'off' },
  unstable: { bg: '#3A2A12', border: '#D89B2B', text: '#FFE3A3', label: 'Unstable connection', icon: 'warning', ariaLive: 'polite' },
  reconnecting: { bg: '#3A2A12', border: '#D89B2B', text: '#FFE3A3', label: 'Reconnecting', icon: 'spinner', ariaLive: 'polite' },
  resyncing: { bg: '#102A43', border: '#4F8CFF', text: '#BFDBFE', label: 'Resyncing match state', icon: 'sync', ariaLive: 'polite' },
  reconnected: { bg: '#123524', border: '#2FA66A', text: '#A7F3D0', label: 'Reconnected', icon: 'check', ariaLive: 'polite' },
  offline: { bg: '#3A1419', border: '#E04F5F', text: '#FCA5A5', label: 'Offline', icon: 'offline', ariaLive: 'assertive' },
  failed: { bg: '#3A1419', border: '#E04F5F', text: '#FCA5A5', label: 'Connection failed', icon: 'error', ariaLive: 'assertive' },
} as const satisfies Record<ConnectionUiState, ConnectionToken>;
