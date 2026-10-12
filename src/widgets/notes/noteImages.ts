/** Picking image files to attach to a note — dropped, pasted, or chosen
 * from a file picker. No DOM beyond the `File`/`FileList` types browsers
 * already hand over; reading the actual bytes only happens later, when an
 * attached image needs an object URL to display. */

export interface NoteImage {
  id: string
  file: File
}

// Generous for a screenshot or photo, enough to stop a dropped video or
// RAW file from silently ballooning the widget's in-memory state.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export interface PickImageFilesResult {
  images: NoteImage[]
  errors: string[]
}

/** Filters a dropped/pasted/picked file list down to acceptable image
 * attachments (by MIME type and size), generating a stable id for each
 * accepted one. Rejections are collected rather than thrown, so one bad
 * file in a multi-file drop doesn't lose the rest. */
export function pickImageFiles(files: FileList | File[], idFactory: () => string): PickImageFilesResult {
  const images: NoteImage[] = []
  const errors: string[] = []
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) {
      errors.push(`${file.name} is not an image.`)
      continue
    }
    if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`${file.name} is larger than ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB.`)
      continue
    }
    images.push({ id: idFactory(), file })
  }
  return { images, errors }
}
