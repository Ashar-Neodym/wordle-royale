import { fixtureUsers } from './users.js';

export const authFixtures = {
  anonymous: { kind: 'anonymous', user: null, onboardingComplete: false },
  profileIncomplete: { kind: 'authenticated', user: fixtureUsers.ashar, onboardingComplete: false, nextRequiredStep: 'profile' },
  consentIncomplete: { kind: 'authenticated', user: fixtureUsers.ashar, onboardingComplete: false, nextRequiredStep: 'consent' },
  complete: { kind: 'authenticated', user: fixtureUsers.ashar, onboardingComplete: true, nextRequiredStep: null },
  loginLoading: { kind: 'loading', action: 'login' },
  invalidCredentials: { kind: 'error', error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.', retryable: false } },
} as const;

export const settingsFixtures = {
  defaultAccessibility: {
    colorblindMode: false,
    highContrastMode: false,
    reducedMotion: false,
    screenReaderAnnouncements: true,
  },
  colorblindReducedMotion: {
    colorblindMode: true,
    highContrastMode: false,
    reducedMotion: true,
    screenReaderAnnouncements: true,
  },
  consent: {
    necessary_gameplay: true,
    product_analytics: false,
    training_insights_opt_in: false,
  },
} as const;
