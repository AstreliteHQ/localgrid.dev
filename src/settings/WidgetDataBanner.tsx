import { Database, HardDrive, Link2, type LucideIcon } from 'lucide-react'
import { WidgetDataRing } from '@/widget-shell/WidgetDataRing'

// A mini World Clock in a 264 × 84 drawing whose saved data goes both to
// this browser and into a share link.
const WIDGET = { x: 8, y: 10, w: 112, h: 64 }
const HEADER_MID = 10
const CHIP = { x: 172, w: 84, h: 22 }
const CHIPS: { y: number; label: string; icon: LucideIcon }[] = [
  { y: 12, label: 'This browser', icon: HardDrive },
  { y: 50, label: 'Share', icon: Link2 },
]
const ROWS = ['Paris   09:41', 'Tokyo   16:41']

/** Introduces widget data at the top of its settings section. */
export function WidgetDataBanner() {
  const glyphX = WIDGET.x + WIDGET.w - 12
  const glyphY = WIDGET.y + HEADER_MID
  const startX = WIDGET.x + WIDGET.w
  const startY = WIDGET.y + WIDGET.h / 2

  return (
    // Same glass as FlowBanner: blurred glows behind a frosted pane.
    <div className="relative isolate overflow-hidden rounded-lg border border-border">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-10 -left-6 size-40 rounded-full bg-emerald-500 opacity-40 blur-3xl" />
        <div className="absolute -right-8 -bottom-12 size-44 rounded-full bg-muted-foreground opacity-20 blur-3xl" />
      </div>
      <div className="flex flex-col items-center gap-3 bg-background/50 p-3 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.5)] backdrop-blur-xl sm:flex-row dark:bg-background/40 dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.08)]">
        <svg
          viewBox="0 0 264 84"
          role="img"
          aria-label="A World Clock's saved cities kept in this browser and carried in a share link"
          className="h-[84px] w-[264px] shrink-0"
        >
          {CHIPS.map((chip) => (
            <path
              key={chip.label}
              d={`M ${startX} ${startY} C ${startX + 26} ${startY}, ${CHIP.x - 26} ${chip.y + CHIP.h / 2}, ${CHIP.x} ${chip.y + CHIP.h / 2}`}
              fill="none"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              className="stroke-emerald-500"
            />
          ))}
          <rect {...WIDGET} width={WIDGET.w} height={WIDGET.h} rx={6} className="fill-card/80 stroke-border" />
          <line
            x1={WIDGET.x}
            x2={WIDGET.x + WIDGET.w}
            y1={WIDGET.y + HEADER_MID * 2}
            y2={WIDGET.y + HEADER_MID * 2}
            className="stroke-border"
          />
          <text x={WIDGET.x + 10} y={glyphY} dominantBaseline="central" fontSize={8} className="fill-foreground">
            World Clock
          </text>
          <WidgetDataRing
            seed="banner"
            x={glyphX - 9}
            y={glyphY - 9}
            width={18}
            height={18}
            className="text-muted-foreground"
          />
          <Database x={glyphX - 4.5} y={glyphY - 4.5} width={9} height={9} className="text-muted-foreground" />
          {ROWS.map((row, index) => (
            <text
              key={row}
              x={WIDGET.x + 10}
              y={WIDGET.y + HEADER_MID * 2 + 14 + index * 14}
              dominantBaseline="central"
              fontSize={8}
              className="fill-muted-foreground font-mono whitespace-pre"
            >
              {row}
            </text>
          ))}
          {CHIPS.map(({ y, label, icon: Icon }) => (
            <g key={label}>
              <rect
                x={CHIP.x}
                y={y}
                width={CHIP.w}
                height={CHIP.h}
                rx={CHIP.h / 2}
                className="fill-card/80 stroke-border"
              />
              <Icon
                x={CHIP.x + 8}
                y={y + 6}
                width={10}
                height={10}
                className="text-emerald-600 dark:text-emerald-400"
              />
              <text
                x={CHIP.x + 22}
                y={y + CHIP.h / 2}
                dominantBaseline="central"
                fontSize={8}
                className="fill-foreground"
              >
                {label}
              </text>
            </g>
          ))}
        </svg>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Keep what a widget holds</p>
          <p className="text-xs text-muted-foreground">
            Widget data is what a widget saves for you, like World Clock cities, a watermark preset or remembered tasks.
            It survives a reload and Clear state, and can travel in a share link.
          </p>
        </div>
      </div>
    </div>
  )
}
