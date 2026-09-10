import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, LayoutGrid, Maximize2, Share2, WifiOff, type LucideIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { AstreliteIcon } from '@/components/icons/AstreliteIcon'
import { GithubIcon } from '@/components/icons/GithubIcon'
import { LogoIcon } from '@/components/icons/LogoIcon'
import { cn } from '@/lib/utils'
import CronWidget from '@/widgets/cron/CronWidget'
import WcagCheckerWidget from '@/widgets/wcag-checker/WcagCheckerWidget'

/** A few illustrative fg/bg pairs, deliberately a mix of clear passes and
 * clear fails, not random RGB noise, so the live preview below visibly
 * flips its pass/fail badges as it cycles rather than just shuffling colors
 * with no obvious pattern. */
const DEMO_PAIRS: { fg: string; bg: string }[] = [
  { fg: '#000000', bg: '#ffffff' },
  { fg: '#65a1fe', bg: '#ffffff' },
  { fg: '#eab308', bg: '#ffffff' },
  { fg: '#ffffff', bg: '#1d4ed8' },
]

/** A few common schedules to cycle the developers' preview through. */
const DEMO_EXPRESSIONS = ['*/5 * * * *', '0 9 * * 1-5', '0 0 * * *']

/** The marketing/About page, linked from the dashboard's logo (see
 * Dashboard.tsx). Mostly imports nothing from @/dashboard, @/widgets,
 * @/overlay, or @/command-palette to keep this its own small bundle via a
 * separate Vite entry (about.html). The two deliberate exceptions are
 * CronWidget and WcagCheckerWidget below, each embedded live as a "see it in
 * action" preview for the developers/designers pitch. Copy mirrors
 * README.md's "Why localgrid" / "Features" sections. */
export function AboutPage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col gap-14 px-6 py-16">
      <header className="flex flex-col items-center gap-6 text-center">
        <h1 className="flex items-center gap-2 font-mono text-2xl font-medium tracking-tight">
          <LogoIcon className="size-8 text-foreground" />
          <span>
            localgrid<span className="text-muted-foreground">.dev</span>
          </span>
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          A browser-based dashboard for everyday developer tools.
        </p>
        <a href={import.meta.env.BASE_URL} className={cn(buttonVariants({ size: 'lg' }))}>
          Jump to dashboard
          <ArrowRight className="size-4" />
        </a>
      </header>

      <section className="flex flex-col gap-4 border-t border-border pt-10">
        <h2 className="text-sm font-medium tracking-tight text-foreground">Why localgrid</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Plenty of good developer-utility sites already exist, covering Base64, JSON, colors,
          timestamps, JWTs, and everything else on this list. What none of them solve is context
          switching: opening a new tool means a new tab, losing your place, and finding your way
          back to what you were doing. Those small interruptions add up when you are debugging.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          localgrid instead treats tools as widgets on a persistent dashboard. Pin the five or six
          you reach for constantly, arrange them however fits your screen, and keep working across
          all of them at once without losing state or hunting for the next tab.
        </p>
      </section>

      <section className="flex flex-col gap-6 border-t border-border pt-10">
        <h2 className="text-sm font-medium tracking-tight text-foreground">Features</h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          <Feature icon={WifiOff} title="Client-side, offline, installable">
            No backend, no account, nothing you paste ever leaves your browser. localgrid
            installs as a PWA and keeps working without a connection.
          </Feature>
          <Feature icon={LayoutGrid} title="A layout that's actually yours">
            Widgets live on a resizable, snap-to-grid dashboard. Drag and resize on desktop or
            tablet; phones get a clean read-only stacked view instead.
          </Feature>
          <Feature icon={Maximize2} title="Expand without losing context">
            Any pinned widget can fill the screen for focused work, and switching back leaves
            everything you typed exactly where it was.
          </Feature>
          <Feature icon={Share2} title="Save and share">
            Layouts persist to <code className="font-mono">localStorage</code> automatically, and
            can be shared with a teammate through a URL or QR code.
          </Feature>
        </div>
      </section>

      <section className="flex flex-col gap-8 border-t border-border pt-10">
        <h2 className="text-sm font-medium tracking-tight text-foreground">Who it's for</h2>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[320px_1fr] sm:items-start">
          <CronPreview />
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-medium text-foreground">For developers</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Essential toolbox for dev and debug activities: JSON Formatter, JWT Encoder, Base64, Regex Tester,
              Certificate Viewer, Subnet Calculator, Hash Generator, UUID Generator, and more.
              The stuff you reach for mid-debug without losing context between decoding, annotating and formatting operations.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-[1fr_320px] sm:items-start">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-medium text-foreground">For designers</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A couple of tools live outside the usual dev checklist too. Color Converter for
              hex, RGB, and HSL conversions, and a WCAG Contrast Checker to catch accessibility
              issues before they ship.
              Color pickers allow you to pick colors outside the browser in any third party app (using the EyeDropper API).
            </p>
          </div>
          <WcagCheckerPreview />
        </div>
      </section>

      <footer className="mt-auto flex items-center justify-center gap-6 border-t border-border pt-8 text-xs text-muted-foreground">
        <a
          href="https://github.com/AstreliteHQ/localgrid.dev"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 hover:text-foreground"
        >
          <GithubIcon className="size-3.5" />
          GitHub
        </a>
        <a
          href="https://astrelite.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 hover:text-foreground"
        >
          <AstreliteIcon className="size-3" />
          Astrelite
        </a>
      </footer>
    </div>
  )
}

/** Live "see it in action" preview for the WCAG Contrast Checker. Cycles
 * through DEMO_PAIRS on an interval, remounting the real widget (via `key`)
 * with a new starting fg/bg pair each time so its own useWidgetState-backed
 * color inputs re-seed from `initialFg`/`initialBg` instead of carrying the
 * previous pair's edits forward. `instanceId` is a fixed, made-up string,
 * safe here because useWidgetState's store is a plain in-memory zustand
 * store with no persistence, freshly created per page load (this page has
 * its own separate bundle/module graph from the dashboard), so it can never
 * collide with or overwrite a real pinned widget's saved state. */
function WcagCheckerPreview() {
  const [pairIndex, setPairIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setPairIndex((current) => (current + 1) % DEMO_PAIRS.length)
    }, 2000)
    return () => clearInterval(id)
  }, [])

  const pair = DEMO_PAIRS[pairIndex]

  return (
    <div className="h-[420px] w-full max-w-[320px] justify-self-center overflow-hidden rounded-lg border border-border bg-card p-2 shadow-sm">
      <WcagCheckerWidget
        key={pairIndex}
        instanceId="about-demo-wcag"
        mode="grid"
        initialFg={pair.fg}
        initialBg={pair.bg}
      />
    </div>
  )
}

/** Live "see it in action" preview for the Cron Expression widget. Unlike
 * the contrast checker, this one is already self-animating (it ticks its
 * own relative-time labels once a second), so cycling through
 * DEMO_EXPRESSIONS on a slower interval is just a bonus, not the only thing
 * making it look alive. Same remount-via-`key` approach and the same
 * in-memory, non-persisted instanceId safety as WcagCheckerPreview above. */
function CronPreview() {
  const [expressionIndex, setExpressionIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setExpressionIndex((current) => (current + 1) % DEMO_EXPRESSIONS.length)
    }, 4000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="w-full max-w-[320px] justify-self-center overflow-hidden rounded-lg border border-border bg-card p-2 shadow-sm">
      <CronWidget
        key={expressionIndex}
        instanceId="about-demo-cron"
        mode="grid"
        initialExpression={DEMO_EXPRESSIONS[expressionIndex]}
      />
    </div>
  )
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}
