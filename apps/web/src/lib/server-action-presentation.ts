import type { ApiClientResult } from './api-client.ts';
import {
  publicAuthPresentation,
  requireAuthPresentationConfiguration,
  type AuthPresentationConfiguration,
  type AuthPresentationPublic,
} from './auth-presentation.ts';

export const ACCOUNT_ACTIONS_DISABLED_PATH = '/account?result=account_disabled';
export const PREVIEW_DEMO_ACTION_UNAVAILABLE_PATH = '/account?result=preview_demo_unavailable';

export const SERVER_ACTION_UNAVAILABLE_MESSAGE = 'Account-backed ranked actions are unavailable in this deployment.';
export const SERVER_ACTION_UNAVAILABLE_CODE = 'account_services_disabled';

type ConfigurationResolver = () => Extract<AuthPresentationConfiguration, { status: 'configured' }>;
type MaybePromise<T> = T | Promise<T>;

/**
 * Resolve the strict public presentation before invoking either callback. The
 * operational callback stays lazy so disabled deployments cannot resolve API
 * configuration, request state, IDs, or clocks through a forged server action.
 */
export async function runOperationalServerAction<T>(
  loadOperational: (presentation: AuthPresentationPublic) => MaybePromise<T>,
  loadDisabled: (presentation: AuthPresentationPublic) => MaybePromise<T>,
  resolveConfiguration: ConfigurationResolver = requireAuthPresentationConfiguration,
): Promise<T> {
  const presentation = publicAuthPresentation(resolveConfiguration());
  if (presentation.mode === 'disabled') return loadDisabled(presentation);
  return loadOperational(presentation);
}

/** Preview-session creation is narrower than other operational actions. */
export async function runPreviewDemoServerAction<T>(
  loadPreviewDemo: (presentation: AuthPresentationPublic) => MaybePromise<T>,
  loadUnavailable: (presentation: AuthPresentationPublic) => MaybePromise<T>,
  resolveConfiguration: ConfigurationResolver = requireAuthPresentationConfiguration,
): Promise<T> {
  const presentation = publicAuthPresentation(resolveConfiguration());
  if (presentation.mode !== 'preview_demo') return loadUnavailable(presentation);
  return loadPreviewDemo(presentation);
}

/** A stable local result that deliberately contains no resolved API origin. */
export function disabledApiClientResult<T>(): ApiClientResult<T> {
  return {
    status: 'unavailable',
    apiUrl: '',
    data: null,
    requestId: null,
    error: SERVER_ACTION_UNAVAILABLE_MESSAGE,
    errorCode: SERVER_ACTION_UNAVAILABLE_CODE,
  };
}

export function runApiClientServerAction<T>(
  loadOperational: (presentation: AuthPresentationPublic) => MaybePromise<ApiClientResult<T>>,
  resolveConfiguration: ConfigurationResolver = requireAuthPresentationConfiguration,
): Promise<ApiClientResult<T>> {
  return runOperationalServerAction(loadOperational, disabledApiClientResult<T>, resolveConfiguration);
}
