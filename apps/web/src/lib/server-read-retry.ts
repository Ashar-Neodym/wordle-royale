export type ServerReadRetryState = {
  disabled: boolean;
  ariaBusy: boolean;
  visibleLabel: string;
  statusLabel: string;
};

export function serverReadRetryState(label: string, pending: boolean): ServerReadRetryState {
  return {
    disabled: pending,
    ariaBusy: pending,
    visibleLabel: pending ? 'Retrying…' : label,
    statusLabel: pending ? `${label} requested. Refreshing live server data.` : '',
  };
}

export function requestServerReadRetry(
  pending: boolean,
  setPending: (value: boolean) => void,
  scheduleReload: (reload: () => void) => void,
  reload: () => void,
): boolean {
  if (pending) return false;
  setPending(true);
  scheduleReload(reload);
  return true;
}
