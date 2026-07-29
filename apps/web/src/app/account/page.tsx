import type { ReactElement } from 'react';
import { headers } from 'next/headers';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import styles from '../../components/web-shell.module.css';
import { startPreviewDemoSessionAction } from '../actions';
import { getCurrentUser } from '../../lib/api-client';
import { requireAuthPresentationConfiguration } from '../../lib/auth-presentation';
import {
  durableAuthRequest,
  inspectInboundCookieHeader,
  type DurableAuthResult,
} from '../../lib/durable-auth-bff';
import { loginAccountAction, logoutAccountAction, registerAccountAction } from './actions';
import { accountActionNotice } from './account-result';

export const dynamic = 'force-dynamic';

type AccountPageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function AvailabilityPanel({ result }: { result: DurableAuthResult }): ReactElement {
  const authenticated = result.status === 'success' && result.code === 'authenticated';
  const signedOut = result.status === 'signed_out';
  return (
    <section className={styles.accountStatus} data-state={authenticated ? 'ready' : signedOut ? 'signed-out' : 'unavailable'} aria-labelledby="account-status-heading">
      <div>
        <p className={styles.eyebrow}>Account status</p>
        <h2 id="account-status-heading">{authenticated ? 'Signed in securely' : signedOut ? 'Accounts available' : 'Account service unavailable'}</h2>
        <p>{authenticated
          ? 'Your browser holds an HttpOnly session cookie. Passwords and session credentials never enter client-side application state.'
          : signedOut
            ? 'This server confirmed that durable account sessions are available.'
            : 'The account service did not confirm availability, so account forms are closed rather than presenting a false live state.'}</p>
      </div>
      <span className={styles.availabilityBadge}>{authenticated ? 'Signed in' : signedOut ? 'Available' : 'Unavailable'}</span>
    </section>
  );
}

function PreviewAccount(): ReactElement {
  return (
    <PageFrame>
      <PageHeader eyebrow="Preview demo session" title="Temporary preview identity">
        <p>This preview uses a temporary demo session, not a durable account. No email or password is required, and session, rating, lobby, and history data may reset.</p>
      </PageHeader>
      <section className={styles.accountStatus} data-state="preview" aria-labelledby="preview-account-heading">
        <div>
          <p className={styles.eyebrow}>Public preview</p>
          <h2 id="preview-account-heading">Try the demo without creating an account</h2>
          <p>Start an explicit preview demo session before current-player writes. This action never creates a production account.</p>
        </div>
        <form action={startPreviewDemoSessionAction}>
          <input type="hidden" name="redirectTo" value="/account" />
          <button className={styles.primaryButton} type="submit">Start preview demo</button>
        </form>
      </section>
    </PageFrame>
  );
}

function DisabledAccount(): ReactElement {
  return (
    <PageFrame>
      <PageHeader eyebrow="Account" title="Accounts are unavailable">
        <p>This production deployment is running with account access disabled.</p>
      </PageHeader>
      <section className={styles.accountUnavailable} aria-labelledby="disabled-account-heading">
        <h2 id="disabled-account-heading">No account actions are available</h2>
        <p>Sign-in and registration controls are intentionally hidden while account access is disabled.</p>
        <div className={styles.actionRow}><a className={styles.secondaryButton} href="/">Return home</a><a className={styles.secondaryButton} href="/server">Server status</a></div>
      </section>
    </PageFrame>
  );
}

export default async function AccountPage({ searchParams }: AccountPageProps): Promise<ReactElement> {
  const presentation = requireAuthPresentationConfiguration();
  if (presentation.mode === 'preview_demo') {
    // Keep the preview route dynamic and exercise the existing session read without
    // presenting it as a durable account.
    await getCurrentUser();
    return <PreviewAccount />;
  }
  if (presentation.mode === 'disabled') return <DisabledAccount />;

  const requestHeaders = await headers();
  const inspected = inspectInboundCookieHeader(requestHeaders.get('cookie'));
  const state: DurableAuthResult = inspected.status === 'rejected'
    ? { status: 'rejected', code: 'auth_cookie_rejected', message: 'The account session cookie could not be verified.' }
    : await durableAuthRequest({ operation: 'me', cookies: inspected.cookies });
  const params = await searchParams;
  const rawResult = params?.result;
  const actionResult = accountActionNotice(typeof rawResult === 'string' ? rawResult : undefined, state);
  const authenticated = state.status === 'success' && state.code === 'authenticated';
  const canAuthenticate = state.status === 'signed_out';
  const registrationMode = presentation.registrationMode;

  return (
    <PageFrame>
      <PageHeader eyebrow="Account" title={authenticated ? `Welcome${state.user?.displayName ? `, ${state.user.displayName}` : ''}` : 'Your Wordle Royale account'}>
        <p>Real account access is server-mediated. Passwords and session tokens are never exposed to client-side application state.</p>
      </PageHeader>

      {actionResult ? <div className={actionResult.tone === 'success' ? styles.successPanel : styles.errorPanel} role="status" aria-live="polite"><strong>{actionResult.text}</strong></div> : null}
      <AvailabilityPanel result={state} />

      {authenticated ? (
        <section className={styles.accountGrid} aria-label="Account overview">
          <article className={styles.accountCard}>
            <p className={styles.eyebrow}>Identity</p>
            <h2>{state.user?.displayName ?? 'Player account'}</h2>
            <dl className={styles.accountDetails}>
              <div><dt>Handle</dt><dd>{state.user?.handle ? `@${state.user.handle}` : 'Not set'}</dd></div>
              <div><dt>Email</dt><dd>{state.user?.email ?? 'Not shown'}</dd></div>
            </dl>
            <div className={styles.actionRow}><a className={styles.primaryButton} href="/profile">View profile</a><a className={styles.secondaryButton} href="/play">Play</a></div>
          </article>
          <article className={styles.accountCard}>
            <p className={styles.eyebrow}>Session</p>
            <h2>This device</h2>
            <p className={styles.muted}>Signing out revokes the current server session. The cookie is preserved if that request is rejected or unavailable.</p>
            <form action={logoutAccountAction}><button className={styles.secondaryButton} type="submit">Sign out</button></form>
          </article>
        </section>
      ) : canAuthenticate ? (
        <div className={styles.accountGrid}>
          <section className={styles.accountCard} aria-labelledby="sign-in-heading">
            <p className={styles.eyebrow}>Returning player</p>
            <h2 id="sign-in-heading">Sign in</h2>
            <p className={styles.muted}>Continue with your durable rating and match identity.</p>
            <form className={styles.accountForm} action={loginAccountAction}>
              <label htmlFor="login-email">Email</label>
              <input id="login-email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} required />
              <label htmlFor="login-password">Password</label>
              <input id="login-password" name="password" type="password" autoComplete="current-password" maxLength={128} required />
              <button className={styles.primaryButton} type="submit">Sign in</button>
            </form>
          </section>
          <section className={styles.accountCard} aria-labelledby="registration-heading">
            <p className={styles.eyebrow}>Registration</p>
            <h2 id="registration-heading">{registrationMode === 'open' ? 'Create account' : registrationMode === 'canary' ? 'Controlled canary registration' : 'Registration closed'}</h2>
            {registrationMode === 'open' ? (
              <>
                <p className={styles.muted}>Public registration is open. Choose the identity shown beside your rated games.</p>
                <form className={styles.accountForm} action={registerAccountAction}>
                  <label htmlFor="register-email">Email</label>
                  <input id="register-email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} required />
                  <label htmlFor="register-handle">Handle <span>3–20 lowercase letters, numbers, or underscores</span></label>
                  <input id="register-handle" name="handle" type="text" autoComplete="username" minLength={3} maxLength={20} pattern="[a-z0-9_]{3,20}" required />
                  <label htmlFor="register-name">Display name</label>
                  <input id="register-name" name="displayName" type="text" autoComplete="nickname" minLength={1} maxLength={40} required />
                  <label htmlFor="register-password">Password <span>12 characters minimum</span></label>
                  <input id="register-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
                  <button className={styles.primaryButton} type="submit">Create account</button>
                </form>
              </>
            ) : registrationMode === 'canary' ? (
              <p className={styles.muted}>Public signup is not open. Only the pre-approved canary identity can register; approval details remain server-side.</p>
            ) : (
              <p className={styles.muted}>New account registration is closed. Existing accounts may still sign in.</p>
            )}
          </section>
        </div>
      ) : (
        <section className={styles.accountUnavailable} aria-labelledby="account-next-heading">
          <h2 id="account-next-heading">Account actions temporarily unavailable</h2>
          <p>Controls stay hidden until the pinned account authority confirms a signed-out state.</p>
        </section>
      )}
    </PageFrame>
  );
}
