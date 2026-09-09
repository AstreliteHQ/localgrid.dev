/** Pure counting logic for the Token Counter widget. No React here so it
 * can be unit-tested and reused without a DOM. */

/** Counts Unicode code points rather than UTF-16 code units, so a
 * surrogate-pair character like an emoji counts as one character instead
 * of two (`"😀".length` is 2; `codePointLength("😀")` is 1). Used by both
 * `countTextStats` and `estimateTokens` so the two never disagree on what
 * counts as a "character". */
function codePointLength(text: string): number {
  return Array.from(text).length
}

/** Neither OpenAI nor Anthropic publish a tokenizer that can run fully
 * offline for every current model (OpenAI's real BPE tables exist but are
 * hundreds of KB to megabytes each; Anthropic doesn't publish one at all),
 * and LocalGrid widgets don't call out to an API or ship a key. This is a
 * rough, provider-agnostic estimate instead: a blend of a word-based guess
 * (~1.3 tokens/word for English prose) and a character-based guess
 * (~4 chars/token), which stays reasonable across prose and code-like text
 * without pretending to be exact for any one model's real tokenizer. */
export function estimateTokens(text: string): number {
  if (!text.trim()) return 0
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const byWords = wordCount * 1.3
  const byChars = codePointLength(text) / 4
  return Math.max(1, Math.round((byWords + byChars) / 2))
}

export interface TextStats {
  characters: number
  words: number
}

export function countTextStats(text: string): TextStats {
  return {
    characters: codePointLength(text),
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
  }
}
