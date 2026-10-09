import LZString from 'lz-string'

/** `LZString.decompressFromEncodedURIComponent`, minus its one sharp edge:
 * despite usually returning null or garbage for input it can't read, the
 * library throws a TypeError on some malformed payloads (e.g. "z", "y" or
 * "zz", where it reads past the end of its own dictionary). Every caller
 * here decodes untrusted text (keystrokes, share links), so this folds that
 * throw into the same "not a payload" null the library already uses. */
export function decompressLzString(text: string): string | null {
  try {
    return LZString.decompressFromEncodedURIComponent(text)
  } catch {
    return null
  }
}

/** Decodes `text` only if it's an actual LZ-String payload. The library
 * readily returns *something* for input that was never compressed (e.g.
 * "helloworld" decodes to a couple of arbitrary characters), and there's no
 * UTF-8-style validity gate to lean on. Recompressing the result and
 * checking it reproduces `text` is: compression is deterministic, so only a
 * real compressed payload round-trips exactly. */
export function decodeLzStringStrict(text: string): string | null {
  const decoded = decompressLzString(text)
  if (!decoded) return null
  return LZString.compressToEncodedURIComponent(decoded) === text ? decoded : null
}
