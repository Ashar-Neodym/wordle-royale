import { requireAuthPresentationConfiguration, publicAuthPresentation } from './auth-presentation.ts';
import { webDeploymentRevision } from './api-authority.ts';

export type PublicWebIdentity = Readonly<{
  revision: string;
  appEnvironment: 'preview' | 'production';
  mode: 'preview_demo' | 'disabled' | 'durable';
  registrationMode: 'closed' | 'canary' | 'open' | null;
}>;

/** Exact non-secret identity contract for deployment preflight. */
export function publicWebIdentity(environment: NodeJS.ProcessEnv = process.env): PublicWebIdentity {
  const revision = webDeploymentRevision(environment);
  if (!/^[a-f0-9]{40,64}$/u.test(revision)) throw new Error('A full serving web revision is required.');
  const presentation = publicAuthPresentation(requireAuthPresentationConfiguration({
    ...(environment.WORDLE_WEB_ENV === undefined ? {} : { WORDLE_WEB_ENV: environment.WORDLE_WEB_ENV }),
    ...(environment.WORDLE_ACCOUNT_MODE === undefined ? {} : { WORDLE_ACCOUNT_MODE: environment.WORDLE_ACCOUNT_MODE }),
    ...(environment.WORDLE_REGISTRATION_MODE === undefined ? {} : { WORDLE_REGISTRATION_MODE: environment.WORDLE_REGISTRATION_MODE }),
  }));
  return { revision, appEnvironment: presentation.appEnvironment, mode: presentation.mode, registrationMode: presentation.registrationMode };
}
