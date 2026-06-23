export const WORD_LIBRARY_MANIFEST_VERSION = 1;
export const WORD_LIBRARY_REPORT_VERSION = 1;
export const FIXTURE_DICTIONARY_VERSION = 'en-5-test-vfixture.001';
export const FIXTURE_SOURCE_ID = 'safe-fixture';
export const WORD_LENGTH_V1 = 5;

export const wordListTypes = ['answer', 'guess_valid', 'banned'] as const;
export const wordListStatuses = ['draft', 'active', 'deprecated', 'deactivated'] as const;
export const difficultyTiers = ['easy', 'medium', 'hard', 'expert'] as const;
export const validationLevels = ['error', 'warning'] as const;
