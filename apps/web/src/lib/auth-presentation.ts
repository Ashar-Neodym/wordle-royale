export const WEB_APP_ENVIRONMENTS = ['preview', 'production'] as const;
export const WORDLE_ACCOUNT_MODES = ['preview_demo', 'disabled', 'durable'] as const;
export const WORDLE_REGISTRATION_MODES = ['closed', 'canary', 'open'] as const;

export type WebAppEnvironment = typeof WEB_APP_ENVIRONMENTS[number];
export type AuthPresentationMode = typeof WORDLE_ACCOUNT_MODES[number];
export type AuthRegistrationMode = typeof WORDLE_REGISTRATION_MODES[number];

/** Public, non-secret presentation values safe for Next build/prerender workers. */
export type AuthPresentationEnvironment = Readonly<{
  WORDLE_WEB_ENV?: string;
  WORDLE_ACCOUNT_MODE?: string;
  WORDLE_REGISTRATION_MODE?: string;
}>;

export function authPresentationEnvironmentFromProcess(): AuthPresentationEnvironment {
  return {
    ...(process.env.WORDLE_WEB_ENV === undefined ? {} : { WORDLE_WEB_ENV: process.env.WORDLE_WEB_ENV }),
    ...(process.env.WORDLE_ACCOUNT_MODE === undefined ? {} : { WORDLE_ACCOUNT_MODE: process.env.WORDLE_ACCOUNT_MODE }),
    ...(process.env.WORDLE_REGISTRATION_MODE === undefined ? {} : { WORDLE_REGISTRATION_MODE: process.env.WORDLE_REGISTRATION_MODE }),
  };
}

export type AuthPresentationConfiguration = Readonly<{
  status: 'configured';
  appEnvironment: WebAppEnvironment;
  mode: AuthPresentationMode;
  registrationMode: AuthRegistrationMode | null;
}> | Readonly<{
  status: 'invalid';
  reason: string;
}>;

function invalid(reason: string): AuthPresentationConfiguration {
  return { status: 'invalid', reason };
}

function exactValue<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return value !== undefined && allowed.includes(value as T) ? value as T : null;
}

/** Sole parser for the public auth presentation contract. */
export function resolveAuthPresentationConfiguration(
  environment: AuthPresentationEnvironment = authPresentationEnvironmentFromProcess(),
): AuthPresentationConfiguration {
  const appEnvironment = exactValue(environment.WORDLE_WEB_ENV, WEB_APP_ENVIRONMENTS);
  const mode = exactValue(environment.WORDLE_ACCOUNT_MODE, WORDLE_ACCOUNT_MODES);
  if (!appEnvironment || !mode) {
    return invalid('WORDLE_WEB_ENV and WORDLE_ACCOUNT_MODE must both use exact supported values.');
  }

  const registrationProvided = environment.WORDLE_REGISTRATION_MODE !== undefined;
  const registrationMode = exactValue(environment.WORDLE_REGISTRATION_MODE, WORDLE_REGISTRATION_MODES);
  if (registrationProvided && !registrationMode) {
    return invalid('WORDLE_REGISTRATION_MODE must be exactly closed, canary, or open.');
  }

  if (appEnvironment === 'preview') {
    if (mode !== 'preview_demo' || registrationProvided) {
      return invalid('Preview must use preview_demo with no registration mode.');
    }
    return { status: 'configured', appEnvironment, mode, registrationMode: null };
  }

  if (mode === 'preview_demo') return invalid('Production may not use preview_demo presentation.');
  if (mode === 'disabled') {
    if (registrationProvided) return invalid('Disabled production must not provide a registration mode.');
    return { status: 'configured', appEnvironment, mode, registrationMode: null };
  }
  if (!registrationMode) {
    return invalid('Durable production requires one explicit registration mode.');
  }
  return { status: 'configured', appEnvironment, mode, registrationMode };
}

export function requireAuthPresentationConfiguration(
  environment: AuthPresentationEnvironment = authPresentationEnvironmentFromProcess(),
): Extract<AuthPresentationConfiguration, { status: 'configured' }> {
  const configuration = resolveAuthPresentationConfiguration(environment);
  if (configuration.status === 'invalid') {
    throw new Error(`Invalid web auth presentation configuration: ${configuration.reason}`);
  }
  return configuration;
}

export type AuthPresentationPublic = Readonly<{
  appEnvironment: WebAppEnvironment;
  mode: AuthPresentationMode;
  registrationMode: AuthRegistrationMode | null;
}>;

export type AuthLimitedPresentation = Readonly<{
  eyebrow: string;
  title: string;
  message: string;
  action: 'preview_demo' | 'sign_in' | 'none';
}>;

/** Truthful signed-out copy/action shared by queue and current-player surfaces. */
export function authLimitedPresentation(
  mode: AuthPresentationMode,
  surface: 'Standard queue' | 'Speed queue' | 'Profile' | 'History',
): AuthLimitedPresentation {
  if (mode === 'preview_demo') return {
    eyebrow: 'Preview auth',
    title: `${surface} requires a session`,
    message: `${surface} requires an explicit temporary preview demo session. Demo data is not durable and may reset.`,
    action: 'preview_demo',
  };
  if (mode === 'durable') return {
    eyebrow: 'Account required',
    title: `Sign in to use ${surface.toLowerCase()}`,
    message: `${surface} requires a durable account session. Use the Account page to sign in with an existing account.`,
    action: 'sign_in',
  };
  return {
    eyebrow: 'Accounts unavailable',
    title: `${surface} is unavailable`,
    message: `Account-backed ${surface.toLowerCase()} is unavailable in this deployment. Account access is disabled.`,
    action: 'none',
  };
}

export function publicAuthPresentation(
  configuration: Extract<AuthPresentationConfiguration, { status: 'configured' }>,
): AuthPresentationPublic {
  return {
    appEnvironment: configuration.appEnvironment,
    mode: configuration.mode,
    registrationMode: configuration.registrationMode,
  };
}
