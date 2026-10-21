/** Picking image files to keep in the buffer, whether dropped, pasted, or
 * chosen from a file picker. Pure `File` filtering: the bytes are only read
 * later, when a thumbnail or preview needs an object URL. */

export interface BufferImage {
  id: string
  file: File
}

export interface PickImageFilesResult {
  images: BufferImage[]
  errors: string[]
}

/** Filters a dropped, pasted, or picked file list down to images (by MIME
 * type), generating an id for each accepted one. Rejections are collected
 * rather than thrown, so one bad file in a multi-file drop doesn't lose the
 * rest. */
export function pickImageFiles(files: FileList | File[], idFactory: () => string): PickImageFilesResult {
  const images: BufferImage[] = []
  const errors: string[] = []
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) images.push({ id: idFactory(), file })
    else errors.push(`${imageLabel(file)} is not an image.`)
  }
  return { images, errors }
}

/** Some clipboards hand over a screenshot with an empty file name. */
export function imageLabel(file: File): string {
  return file.name || 'Pasted image'
}
