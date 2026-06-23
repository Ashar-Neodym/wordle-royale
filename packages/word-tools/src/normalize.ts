export type NormalizeResult = { ok: true; normalizedText: string } | { ok: false; reason: string };

export function normalizeWord(raw: string, wordLength = 5): NormalizeResult {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length !== wordLength) return { ok: false, reason: `expected_${wordLength}_letters` };
  if (!/^[a-z]+$/.test(trimmed)) return { ok: false, reason: 'expected_lowercase_ascii_letters_only' };
  return { ok: true, normalizedText: trimmed };
}

export function hasDuplicateLetters(word: string): boolean {
  return new Set(word).size !== word.length;
}
