'use client';

import { useState, type ReactElement } from 'react';
import { requestServerReadRetry, serverReadRetryState } from '../lib/server-read-retry';
import styles from './web-shell.module.css';

export function ServerReadRetryButton({ label }: { label: string }): ReactElement {
  const [pending, setPending] = useState(false);
  const state = serverReadRetryState(label, pending);

  function retry(): void {
    // A full same-URL reload always performs a fresh server-component render while
    // preserving the current pathname, query string, and fragment.
    requestServerReadRetry(
      pending,
      setPending,
      (reload) => window.setTimeout(reload, 0),
      () => window.location.reload(),
    );
  }

  return (
    <>
      <button
        className={styles.primaryButton}
        type="button"
        disabled={state.disabled}
        aria-busy={state.ariaBusy}
        onClick={retry}
      >
        {state.visibleLabel}
      </button>
      <span className={styles.srOnly} role="status" aria-live="polite">{state.statusLabel}</span>
    </>
  );
}
