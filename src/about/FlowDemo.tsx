import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Binary, Hash, type LucideIcon } from 'lucide-react'
import { Conveyor } from '@/flow/Conveyor'
import { DEFAULT_FLOW_COLORS, readableTextColor } from '@/flow/linkGraph'
import { useFlowStore } from '@/flow/useFlowStore'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import Base64Widget from '@/widgets/base64/Base64Widget'
import HashGeneratorWidget from '@/widgets/hash-generator/HashGeneratorWidget'
import { useWidgetStateStore } from '@/widgets/useWidgetState'

const SOURCE_ID = 'about-demo-base64'
const TARGET_ID = 'about-demo-hash'
const COLOR = DEFAULT_FLOW_COLORS[0]
/** Matches `HEADER_ANCHOR_Y` on the dashboard: tabs and wire sit on the header line. */
const HEADER_Y = 18
const PHRASES = ['hello, localgrid', 'user:hunter2', '{"id": 42, "role": "admin"}']
const TYPE_MS = 70
const PAUSE_MS = 2200

// Base64Widget and HashGeneratorWidget publish their output through the real
// flow store, which persists links to localStorage on every update. This page
// must never touch the dashboard's saved links (another tab may be editing
// them), so the store writes nowhere while the About page is loaded.
useFlowStore.persist.setOptions({
  storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
})

/** Live "Automate" demo: a real Base64 widget whose published output is
 * carried into a real Hash Generator's `input` field, the same field a flow
 * link writes on the dashboard. The pipe is done here rather than through a
 * flow link because delivery is gated by the user's Flow setting (off by
 * default), and enabling it would write to their saved settings. A short
 * typewriter loop fills the source until the visitor clicks into it. */
export function FlowDemo() {
  const id = useId()
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const takenOver = useRef(false)

  // Pipe: source output -> target input, like `push` in useFlowStore.
  useEffect(() => {
    const deliver = (value: string | undefined) => {
      if (value === undefined) return
      const key = `${TARGET_ID}:input`
      const widgetState = useWidgetStateStore.getState()
      if (widgetState.values[key] !== value) widgetState.setValue(key, value)
    }
    deliver(useFlowStore.getState().outputs[SOURCE_ID])
    return useFlowStore.subscribe((state, previous) => {
      if (state.outputs[SOURCE_ID] !== previous.outputs[SOURCE_ID]) deliver(state.outputs[SOURCE_ID])
    })
  }, [])

  // Types each phrase into the source, then pauses, until the visitor takes over.
  useEffect(() => {
    const setSource = (text: string) => useWidgetStateStore.getState().setValue(`${SOURCE_ID}:input`, text)
    let phrase = 0
    let length = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (takenOver.current) return
      const text = PHRASES[phrase]
      if (reduceMotion) {
        setSource(text)
        phrase = (phrase + 1) % PHRASES.length
        timer = setTimeout(tick, PAUSE_MS * 1.5)
        return
      }
      length += 1
      setSource(text.slice(0, length))
      if (length < text.length) {
        timer = setTimeout(tick, TYPE_MS)
        return
      }
      phrase = (phrase + 1) % PHRASES.length
      length = 0
      timer = setTimeout(tick, PAUSE_MS)
    }
    timer = setTimeout(tick, 400)
    return () => clearTimeout(timer)
  }, [reduceMotion])

  return (
    <div className="flex flex-col items-center gap-0 sm:flex-row sm:items-start">
      <DemoCard
        title="Base64"
        icon={Binary}
        port="out"
        onInteract={() => {
          takenOver.current = true
        }}
      >
        <Base64Widget instanceId={SOURCE_ID} mode="grid" />
      </DemoCard>

      {/* Wire between the OUT and IN tabs: horizontal beside, vertical stacked. */}
      <svg aria-hidden="true" viewBox="0 0 40 12" className="mt-[12px] hidden h-3 w-10 shrink-0 sm:block">
        <Conveyor
          id={`${id}-h`}
          points={[
            { x: 0, y: 6 },
            { x: 40, y: 6 },
          ]}
          color={COLOR}
          highlighted
          moving={!reduceMotion}
        />
      </svg>
      <svg aria-hidden="true" viewBox="0 0 12 32" className="h-8 w-3 shrink-0 sm:hidden">
        <Conveyor
          id={`${id}-v`}
          points={[
            { x: 6, y: 0 },
            { x: 6, y: 32 },
          ]}
          color={COLOR}
          highlighted
          moving={!reduceMotion}
        />
      </svg>

      <DemoCard title="Hash Generator" icon={Hash} port="in" source="Base64">
        <HashGeneratorWidget instanceId={TARGET_ID} mode="grid" />
      </DemoCard>
    </div>
  )
}

/** A widget card with a title bar and a colored IN or OUT tab on its header
 * edge, drawn like `FlowPort` on the dashboard. */
function DemoCard({
  title,
  icon: Icon,
  port,
  source,
  onInteract,
  children,
}: {
  title: string
  icon: LucideIcon
  port: 'in' | 'out'
  /** Name of the feeding widget, shown in the header like a connected input. */
  source?: string
  onInteract?: () => void
  children: ReactNode
}) {
  return (
    <div
      className="relative flex h-[300px] w-full max-w-[300px] min-w-0 flex-col rounded-lg border border-border bg-card shadow-sm sm:flex-1"
      onPointerDownCapture={onInteract}
      onKeyDownCapture={onInteract}
    >
      <div
        className={cn(
          'flex h-9 shrink-0 items-center gap-2 border-b border-border',
          port === 'in' ? 'pr-3 pl-6' : 'pr-6 pl-3',
        )}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium text-foreground">{title}</span>
        {source && (
          <span
            className="ml-auto truncate rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none"
            style={{ backgroundColor: COLOR, color: readableTextColor(COLOR) }}
          >
            ← {source}
          </span>
        )}
      </div>
      <span
        aria-hidden="true"
        style={{ top: HEADER_Y, backgroundColor: COLOR, color: readableTextColor(COLOR) }}
        className={cn(
          'absolute z-10 flex h-4 -translate-y-1/2 items-center rounded-full px-1 font-mono text-[9px] leading-none font-bold tracking-wide select-none',
          port === 'in' ? '-left-1.5' : '-right-1.5',
        )}
      >
        {port === 'in' ? 'IN' : 'OUT'}
      </span>
      <div className="min-h-0 flex-1 overflow-hidden p-2">{children}</div>
    </div>
  )
}
