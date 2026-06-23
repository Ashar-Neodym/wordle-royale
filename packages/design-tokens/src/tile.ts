import { baseColors } from './color.js';

export type TileFeedbackState =
  | 'empty'
  | 'filled'
  | 'pending'
  | 'submitted'
  | 'correct'
  | 'present'
  | 'absent'
  | 'invalid'
  | 'locked'
  | 'disabled';

export type TilePattern = 'none' | 'outline' | 'dot' | 'check' | 'diagonal-stripe' | 'dash' | 'exclamation' | 'lock';

export type TileToken = {
  bg: string;
  border: string;
  text: string;
  pattern: TilePattern;
  icon: 'none' | 'clock' | 'check' | 'dot' | 'dash' | 'exclamation' | 'lock';
  label: string;
  accessibilityNote: string;
  colorOnlySafe: false;
};

export const tileStates = {
  empty: { bg: baseColors.tileEmpty, border: baseColors.slate700, text: baseColors.paperWhite, pattern: 'none', icon: 'none', label: 'Empty', accessibilityNote: 'Announce as empty cell only when focused or relevant.', colorOnlySafe: false },
  filled: { bg: baseColors.tileFilled, border: baseColors.slate500, text: baseColors.paperWhite, pattern: 'none', icon: 'none', label: 'Filled', accessibilityNote: 'Letter should be read clearly.', colorOnlySafe: false },
  pending: { bg: baseColors.tileFilled, border: baseColors.crownGold, text: baseColors.paperWhite, pattern: 'outline', icon: 'none', label: 'Pending', accessibilityNote: 'Use while waiting for server confirmation.', colorOnlySafe: false },
  submitted: { bg: baseColors.slateInk, border: baseColors.electricBlue, text: baseColors.paperWhite, pattern: 'dot', icon: 'clock', label: 'Submitted', accessibilityNote: 'Indicates locked but not revealed yet.', colorOnlySafe: false },
  correct: { bg: baseColors.royalGreen, border: baseColors.green200, text: baseColors.royalGreenText, pattern: 'check', icon: 'check', label: 'Correct', accessibilityNote: 'Must not rely only on green; pair with check marker and screen-reader label.', colorOnlySafe: false },
  present: { bg: baseColors.signalAmber, border: baseColors.warningSoft, text: '#111827', pattern: 'diagonal-stripe', icon: 'dot', label: 'Present', accessibilityNote: 'Must not rely only on amber/yellow; pair with stripe or dot marker.', colorOnlySafe: false },
  absent: { bg: baseColors.ashGray, border: '#9CA3AF', text: baseColors.paperWhite, pattern: 'dash', icon: 'dash', label: 'Absent', accessibilityNote: 'Distinct from disabled by dash marker and accessible label.', colorOnlySafe: false },
  invalid: { bg: baseColors.errorRed, border: baseColors.red200, text: '#FFFFFF', pattern: 'exclamation', icon: 'exclamation', label: 'Invalid', accessibilityNote: 'Always pair with text feedback such as “Not in word list”.', colorOnlySafe: false },
  locked: { bg: baseColors.deepSlate, border: baseColors.slate500, text: baseColors.slate300, pattern: 'lock', icon: 'lock', label: 'Locked', accessibilityNote: 'Read-only state after solve, fail, or timeout.', colorOnlySafe: false },
  disabled: { bg: baseColors.tileDisabled, border: baseColors.slate700, text: baseColors.slate500, pattern: 'none', icon: 'none', label: 'Disabled', accessibilityNote: 'Use for unavailable input; do not confuse with absent.', colorOnlySafe: false },
} as const satisfies Record<TileFeedbackState, TileToken>;

export const tileVariants = {
  colorblind: {
    correct: { ...tileStates.correct, pattern: 'check', icon: 'check', border: '#FFFFFF' },
    present: { ...tileStates.present, pattern: 'diagonal-stripe', icon: 'dot', border: '#FFFFFF' },
    absent: { ...tileStates.absent, pattern: 'dash', icon: 'dash' },
    invalid: { ...tileStates.invalid, pattern: 'exclamation', icon: 'exclamation' },
  },
  highContrast: {
    empty: { ...tileStates.empty, border: '#FFFFFF' },
    filled: { ...tileStates.filled, border: '#FFFFFF' },
    pending: { ...tileStates.pending, border: '#FFFFFF' },
    submitted: { ...tileStates.submitted, border: '#FFFFFF' },
    correct: { ...tileStates.correct, border: '#FFFFFF' },
    present: { ...tileStates.present, border: '#FFFFFF' },
    absent: { ...tileStates.absent, border: '#FFFFFF' },
    invalid: { ...tileStates.invalid, border: '#FFFFFF' },
    locked: { ...tileStates.locked, border: '#FFFFFF' },
    disabled: { ...tileStates.disabled, border: '#94A3B8' },
  } satisfies Record<TileFeedbackState, TileToken>,
  reducedMotion: {
    revealDuration: '0ms',
    invalidFeedback: 'text-and-border',
    confetti: false,
  },
} as const;
