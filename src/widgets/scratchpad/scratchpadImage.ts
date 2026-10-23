import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import ScratchpadImageView from './ScratchpadImageView'

/** TipTap's Image node, rendered through ScratchpadImageView for the hover
 * copy/remove controls and allowed to hold `data:` URLs (pasted screenshots
 * are stored inline so the note stays self-contained). */
export const ScratchpadImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ScratchpadImageView)
  },
}).configure({
  allowBase64: true,
  // Only affects exported HTML (getHTML), not the node view above: keeps a
  // full-size screenshot from overflowing the page it is pasted into.
  HTMLAttributes: { style: 'max-width: 100%; height: auto;' },
})
