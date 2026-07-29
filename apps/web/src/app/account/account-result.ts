import type { DurableAuthResult } from '../../lib/durable-auth-bff';

export type AccountNotice = Readonly<{ tone: 'success' | 'error'; text: string }>;

export const accountResultMessages = {
  authenticated: { tone: 'success', text: 'Your account session is ready.' },
  signed_out: { tone: 'success', text: 'You are signed out on this device.' },
  not_authenticated: { tone: 'error', text: 'Sign in to continue.' },
  invalid_credentials: { tone: 'error', text: 'Email or password is incorrect.' },
  invalid_request: { tone: 'error', text: 'Check your account details and try again.' },
  account_conflict: { tone: 'error', text: 'That email or handle cannot be used.' },
  rate_limited: { tone: 'error', text: 'Too many attempts. Wait a moment and try again.' },
  auth_not_configured: { tone: 'error', text: 'Durable accounts are not available in this deployment.' },
  auth_presentation_disabled: { tone: 'error', text: 'Account actions are unavailable in this deployment.' },
  registration_closed: { tone: 'error', text: 'Registration is currently closed.' },
  auth_upstream_unavailable: { tone: 'error', text: 'Account service is temporarily unavailable.' },
  auth_transport_unavailable: { tone: 'error', text: 'Account service is temporarily unavailable.' },
  auth_redirect_rejected: { tone: 'error', text: 'Account service is temporarily unavailable.' },
  auth_authority_mismatch: { tone: 'error', text: 'Account service is temporarily unavailable.' },
  auth_response_malformed: { tone: 'error', text: 'Account service is temporarily unavailable.' },
  auth_token_response_rejected: { tone: 'error', text: 'Account service is temporarily unavailable.' },
  auth_cookie_rejected: { tone: 'error', text: 'A secure session could not be established.' },
  auth_request_rejected: { tone: 'error', text: 'The account request could not be verified.' },
} as const satisfies Record<string, AccountNotice>;

export const FIXED_SAFE_ACCOUNT_RESULT_CODES = Object.freeze(Object.keys(accountResultMessages));

/** Query parameters report only an action outcome; /auth/me remains session truth. */
export function accountActionNotice(code: string | undefined, currentState: DurableAuthResult): AccountNotice | undefined {
  if (!code || !(code in accountResultMessages)) return undefined;
  if (code === 'authenticated'
    && !(currentState.status === 'success' && currentState.code === 'authenticated')) return undefined;
  if (code === 'signed_out' && currentState.status !== 'signed_out') return undefined;
  return accountResultMessages[code as keyof typeof accountResultMessages];
}
