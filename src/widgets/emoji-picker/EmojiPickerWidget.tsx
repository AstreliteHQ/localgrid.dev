import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { EmojiPicker } from 'frimousse'
import { AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'

const SEARCH_CLASSES =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30'

type Status = 'idle' | 'copied' | 'failed'

/** Emoji data is served from this app's own origin (emitted at build time
 * from the pinned emojibase-data package, see vite.config.ts) rather than
 * frimousse's default of cdn.jsdelivr.net, so the Content-Security-Policy can
 * keep `connect-src` to 'self' and the picker works offline. */
const EMOJIBASE_URL = `${import.meta.env.BASE_URL}emojibase`

/** Search + copy-to-clipboard emoji picker. All emoji data, search matching,
 * and keyboard navigation come from frimousse — this widget only supplies
 * styling and the copy-on-select behavior. */
export default function EmojiPickerWidget({ instanceId }: WidgetProps) {
  const [search, setSearch] = useWidgetState(instanceId, 'search', '')
  useWidgetDirty(instanceId, search !== '')

  const [status, setStatus] = useState<Status>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const handleSelect = async ({ emoji }: { emoji: string }) => {
    try {
      await navigator.clipboard.writeText(emoji)
      setStatus('copied')
    } catch {
      // Clipboard API can reject (denied permission, insecure context) —
      // selection still works, it's just surfaced as a "Copy failed" status
      // below rather than a silent no-op, matching CopyButton.
      setStatus('failed')
    }
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setStatus('idle'), 1200)
  }

  return (
    <EmojiPicker.Root
      onEmojiSelect={handleSelect}
      emojibaseUrl={EMOJIBASE_URL}
      className="flex h-full flex-col gap-2 text-xs"
      // frimousse defaults --frimousse-emoji-font to a hardcoded list of
      // per-OS emoji font names ('Apple Color Emoji', 'Segoe UI Emoji',
      // etc.) — on Firefox that list resolves to its bundled Twemoji
      // Mozilla font instead of the OS's own, which renders monochrome/
      // oddly-shaped glyphs for some emoji. Pointing it at the app's own
      // system-font stack instead lets the browser pick whatever font it
      // already uses for everything else, sidestepping that font-matching
      // quirk entirely.
      style={{ '--frimousse-emoji-font': 'var(--font-sans)' } as CSSProperties}
    >
      <div className="flex shrink-0 items-center gap-2">
        <EmojiPicker.Search
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search emoji…"
          className={SEARCH_CLASSES}
        />
        <span
          aria-live="polite"
          className={cn(
            'flex shrink-0 items-center gap-1 text-muted-foreground',
            status === 'failed' && 'text-destructive',
            status === 'idle' && 'invisible',
          )}
        >
          {status === 'failed' ? <AlertTriangle className="size-3.5" /> : <Check className="size-3.5" />}
          {status === 'failed' ? 'Copy failed' : 'Copied'}
        </span>
      </div>

      <EmojiPicker.Viewport className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-background dark:bg-muted/40">
        <EmojiPicker.Loading className="flex h-full items-center justify-center text-muted-foreground">
          Loading…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="flex h-full items-center justify-center text-muted-foreground">
          No emoji found.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="pb-1.5 select-none"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div
                {...props}
                className="bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground dark:bg-muted/60"
              >
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div {...props} className="px-1.5">
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                {...props}
                className="flex size-8 items-center justify-center rounded-md text-base data-active:bg-accent"
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  )
}
