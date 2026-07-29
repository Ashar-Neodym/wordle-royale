import type { ReactElement } from 'react';
import { headers } from 'next/headers';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import styles from '../../components/web-shell.module.css';
import {
  durableAuthRequest,
  inspectInboundCookieHeader,
  resolveDurableAuthConfiguration,
  type DurableAuthResult,
} from '../../lib/durable-auth-bff';
import { loginAccountAction, logoutAccountAction, registerAccountAction } from './actions';
import { accountActionNotice } from './account-result';

export const dynamic = 'force-dynamic';

type AccountPageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function AvailabilityPanel({ result, configuredReason }: { result: DurableAuthResult; configuredReason: string | null }): ReactElement {
  const authenticated = result.status === 'success' && result.code === 'authenticated';
  const signedOut = result.status === 'signed_out';
  return (
    <section className={styles.accountStatus} data-state={authenticated ? 'ready' : signedOut ? 'signed-out' : 'unavailable'} aria-labelledby="account-status-heading">
      <div>
        <p className={styles.eyebrow}>Deployment status</p>
        <h2 id="account-status-heading">{authenticated ? 'Signed in securely' : signedOut ? 'Accounts available' : 'Durable accounts unavailable'}</h2>
        <p>{authenticated
          ? 'Your browser holds an HttpOnly session cookie. Passwords and session credentials never enter client-side application state.'
          : signedOut
            ? 'This server confirmed that account sessions are available. Sign in or create an account below.'
            : configuredReason ?? 'The account service did not confirm availability, so account forms are closed rather than presenting a false live state.'}</p>
      </div>
      <span className={styles.availabilityBadge}>{authenticated ? 'Signed in' : signedOut ? 'Available' : 'Not live'}</span>
    </section>
  );
}

export default async function AccountPage({ searchParams }: AccountPageProps): Promise<ReactElement> {
  const configuration = resolveDurableAuthConfiguration();
  const requestHeaders = await headers();
  const inspected = inspectInboundCookieHeader(requestHeaders.get('cookie'));
  const state: DurableAuthResult = configuration.status !== 'available'
    ? { status: 'unavailable', code: 'auth_not_configured', message: 'Durable accounts are not available in this deployment.' }
    : inspected.status === 'rejected'
      ? { status: 'rejected', code: 'auth_cookie_rejected', message: 'The account session cookie could not be verified.' }
      : await durableAuthRequest({ operation: 'me', cookies: inspected.cookies });
  const params = await searchParams;
  const rawResult = params?.result;
  const actionResult = accountActionNotice(typeof rawResult === 'string' ? rawResult : undefined, state);
  const authenticated = state.status === 'success' && state.code === 'authenticated';
  const canAuthenticate = state.status === 'signed_out';

  return (
    <PageFrame>
      <PageHeader eyebrow="Account" title={authenticated ? `Welcome${state.user?.displayName ? `, ${state.user.displayName}` : ''}` : 'Your Wordle Royale account'}>
        <p>Durable account access is server-mediated: this page never receives a session token, and availability follows the configured API response instead of a marketing promise.</p>
      </PageHeader>

      {actionResult ? <div className={actionResult.tone === 'success' ? styles.successPanel : styles.errorPanel} role="status" aria-live="polite"><strong>{actionResult.text}</strong></div> : null}
      <AvailabilityPanel result={state} configuredReason={configuration.reason} />

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
            <p className={styles.muted}>Signing out revokes the current server session and clears this deployment&apos;s durable session cookie from this browser.</p>
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
          <section className={styles.accountCard} aria-labelledby="create-account-heading">
            <p className={styles.eyebrow}>New player</p>
            <h2 id="create-account-heading">Create account</h2>
            <p className={styles.muted}>Choose the public identity shown beside your rated games.</p>
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
          </section>
        </div>
      ) : (
        <section className={styles.accountUnavailable} aria-labelledby="account-next-heading">
          <h2 id="account-next-heading">Nothing to submit yet</h2>
          <p>Sign-in and registration controls stay hidden until this deployment has durable auth enabled and its pinned account authority confirms the signed-out state.</p>
          <div className={styles.actionRow}><a className={styles.secondaryButton} href="/">Return home</a><a className={styles.secondaryButton} href="/server">Server status</a></div>
        </section>
      )}
    </PageFrame>
  );
}
