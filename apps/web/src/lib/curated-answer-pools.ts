/**
 * Immutable answer ordering for local challenge protocol V1.
 *
 * Never reorder, insert, or remove entries: a V1 challenge nonce selects an
 * answer by index, so changing this array would change existing challenges.
 */
export const CURATED_ANSWERS_V1 = [
  'allee', 'arena', 'array', 'bloom', 'brave', 'chair', 'civic', 'crane',
  'crown', 'flame', 'knoll', 'level', 'light', 'mamma', 'model', 'plant',
  'press', 'pride', 'slate', 'sound', 'apple', 'beach', 'bread', 'cloud',
  'dance', 'dream', 'earth', 'field', 'grape', 'green', 'house', 'lemon',
  'music', 'ocean', 'peach', 'river', 'smile', 'stone', 'table', 'tiger',
  'train', 'water', 'world', 'youth',
] as const;
