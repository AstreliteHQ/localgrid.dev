import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { AlertTriangle, Check, Copy, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toPngBlob } from './scratchpadContent'

type CopyStatus = 'idle' | 'copied' | 'failed'

/** Block image with a hover toolbar to copy the picture on its own (as PNG,
 * the one image type every browser can write) or remove it. */
export default function ScratchpadImageView({ node, selected, deleteNode }: ReactNodeViewProps) {
  const { src, alt } = node.attrs as { src: string; alt: string | null }
  const [status, setStatus] = useState<CopyStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleCopy = async () => {
    try {
      if (typeof ClipboardItem === 'undefined') throw new Error('ClipboardItem is not supported')
      // The promise goes straight into ClipboardItem so Safari still sees
      // the write as part of the click, even though encoding is async.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPngBlob(src) })])
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setStatus('idle'), 1200)
  }

  return (
    <NodeViewWrapper className="group/image relative my-2 w-fit max-w-full" data-drag-handle>
      <img
        src={src}
        alt={alt ?? ''}
        draggable={false}
        className={cn(
          'block h-auto max-w-full rounded-md border border-border',
          selected && 'ring-2 ring-ring/60 ring-offset-1 ring-offset-background',
        )}
      />
      <div
        contentEditable={false}
        className={cn(
          'absolute top-1 right-1 flex items-center gap-0.5 rounded-md border border-border bg-background/90 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/image:opacity-100 focus-within:opacity-100',
          (selected || status !== 'idle') && 'opacity-100',
        )}
      >
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={handleCopy}
          aria-label={status === 'copied' ? 'Image copied' : status === 'failed' ? 'Copy failed' : 'Copy image'}
          title="Copy image"
          className={cn(status === 'failed' && 'text-destructive')}
        >
          {status === 'copied' ? (
            <Check className="size-3" />
          ) : status === 'failed' ? (
            <AlertTriangle className="size-3" />
          ) : (
            <Copy className="size-3" />
          )}
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={deleteNode}
          aria-label="Remove image"
          title="Remove image"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </NodeViewWrapper>
  )
}
