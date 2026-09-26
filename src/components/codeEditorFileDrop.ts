/** Same heuristic CodeMirror's own drop handler uses to skip binary files:
 * plain text (even with odd whitespace like form feeds) almost never has two
 * control characters in a row, while images, archives, PDFs, etc. do within
 * their first few bytes. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const BINARY_PATTERN = /[\x00-\x08\x0e-\x1f]{2}/

export function looksBinary(text: string): boolean {
  return BINARY_PATTERN.test(text)
}

/** Whether a drag carries files from the OS, as opposed to text or a
 * dashboard widget being dragged around. Only `types` is readable during
 * dragenter/dragover (the files themselves stay hidden until drop). */
export function isFileDrag(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes('Files')
}

export type DroppedFileResult = { ok: true; text: string } | { ok: false; error: string }

/** Reads the first dropped file as text for the editor to take over whole.
 * Only one file: concatenating several into one buffer is rarely what
 * someone formatting JSON or diffing text wants. */
export async function readDroppedFile(files: FileList | File[]): Promise<DroppedFileResult> {
  const file = files[0]
  if (!file) return { ok: false, error: 'No file dropped.' }
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: `Could not read ${file.name}.` }
  }
  if (looksBinary(text)) {
    return { ok: false, error: `${file.name} is not a plain text file.` }
  }
  return { ok: true, text }
}
