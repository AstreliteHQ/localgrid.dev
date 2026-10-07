import { useId } from 'react'
import { CircleCheck, Info, CircleX } from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
import { Field } from '@/components/Field'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import {
  bump,
  format,
  formatSet,
  parseRange,
  satisfiesSet,
  validate,
  type BumpKind,
  type ComparatorSet,
  type SemVer,
} from './semver'

const DEFAULT_VERSION = '1.4.2-rc.1+sha.5114f85'
const DEFAULT_RANGE = '^1.4.2-rc.0'

/** One hue per part so the same part reads the same everywhere. Borrows
 * the data-tree palette: it already separates value kinds in both themes,
 * which the semantic roles (success/destructive/muted) can't. */
const PART_STYLES = {
  major: 'bg-tree-tag/10 text-tree-tag',
  minor: 'bg-tree-attr/10 text-tree-attr',
  patch: 'bg-tree-string/10 text-tree-string',
  prerelease: 'bg-tree-boolean/10 text-tree-boolean',
  build: 'bg-muted text-muted-foreground',
} as const

const BUMPS: { kind: BumpKind; label: string }[] = [
  { kind: 'major', label: 'Major' },
  { kind: 'minor', label: 'Minor' },
  { kind: 'patch', label: 'Patch' },
]

export default function SemverWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'version', DEFAULT_VERSION)
  const [range, setRange] = useWidgetState(instanceId, 'range', DEFAULT_RANGE)
  const [includePrerelease, setIncludePrerelease] = useWidgetState(instanceId, 'includePrerelease', false)
  useWidgetDirty(instanceId, input !== DEFAULT_VERSION || range !== DEFAULT_RANGE || includePrerelease)

  const versionId = useId()
  const rangeId = useId()
  const prereleaseId = useId()
  const issuesId = useId()
  const rangeErrorId = useId()

  const result = validate(input)
  const { version } = result
  const parsedRange = range.trim() === '' ? null : parseRange(range)
  const rangeError = parsedRange && !parsedRange.ok ? parsedRange.error : null

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-auto text-xs">
      <Field label="Version" htmlFor={versionId}>
        <div className="relative">
          <Input
            id={versionId}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="1.0.0-alpha.1+build.5"
            spellCheck={false}
            aria-invalid={!version}
            aria-describedby={version ? undefined : issuesId}
            className="pr-8 font-mono text-sm"
          />
          <CopyButton value={input} label="" ariaLabel="Copy version" className="absolute right-0.5 top-0.5 px-1.5" />
        </div>
      </Field>

      {version ? (
        <>
          <ComplianceBadge valid />
          <VersionParts version={version} />
          <VersionNotes version={version} />
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground">Next</span>
            {BUMPS.map(({ kind, label }) => {
              const next = format(bump(version, kind))
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setInput(next)}
                  title={`Set the version to the next ${kind} release`}
                  className="rounded bg-secondary px-1.5 py-1 font-mono text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                >
                  <span className="font-sans">{label}</span> {next}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <ComplianceBadge valid={false} />
          <ul id={issuesId} className="space-y-0.5" aria-label="Spec violations">
            {result.issues.map((issue) => (
              <li key={issue} className="flex items-start gap-1.5 text-destructive">
                <CircleX className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {issue}
              </li>
            ))}
          </ul>
          {result.suggestion && (
            <p className="flex flex-wrap items-center gap-1 text-muted-foreground">
              Did you mean <code className="font-mono text-foreground">{result.suggestion}</code>?
              <button
                type="button"
                onClick={() => setInput(result.suggestion as string)}
                className="rounded bg-secondary px-1.5 py-0.5 font-medium text-foreground transition-colors hover:bg-secondary/80"
              >
                Use it
              </button>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-2">
        <Field label="Range" htmlFor={rangeId}>
          <Input
            id={rangeId}
            aria-invalid={rangeError !== null}
            aria-describedby={rangeError ? rangeErrorId : undefined}
            value={range}
            onChange={(event) => setRange(event.target.value)}
            placeholder="^1.2.0 || >=2.0.0 <3"
            spellCheck={false}
            className="font-mono text-sm"
          />
        </Field>
        <label htmlFor={prereleaseId} className="flex w-fit items-center gap-1.5 text-muted-foreground">
          <input
            id={prereleaseId}
            type="checkbox"
            checked={includePrerelease}
            onChange={(event) => setIncludePrerelease(event.target.checked)}
            className="accent-primary"
          />
          Include pre-releases
        </label>
        {rangeError && (
          <div id={rangeErrorId}>
            <ErrorMessage>{rangeError}</ErrorMessage>
          </div>
        )}
        {parsedRange?.ok && (
          <RangeResult version={version} sets={parsedRange.sets} includePrerelease={includePrerelease} />
        )}
      </div>
    </div>
  )
}

function ComplianceBadge({ valid }: { valid: boolean }) {
  const Icon = valid ? CircleCheck : CircleX
  return (
    <p
      className={cn(
        'flex w-fit items-center gap-1 rounded px-1.5 py-0.5 font-medium',
        valid ? 'bg-success/15 text-success dark:bg-success/20' : 'bg-destructive/10 text-destructive',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {valid ? 'Valid SemVer 2.0.0' : 'Not SemVer 2.0.0 compliant'}
    </p>
  )
}

function VersionParts({ version }: { version: SemVer }) {
  return (
    <div className="flex flex-wrap items-start gap-x-0.5 gap-y-1.5 font-mono" aria-label="Version parts">
      <Part label="Major" value={String(version.major)} style={PART_STYLES.major} />
      <Separator char="." />
      <Part label="Minor" value={String(version.minor)} style={PART_STYLES.minor} />
      <Separator char="." />
      <Part label="Patch" value={String(version.patch)} style={PART_STYLES.patch} />
      {version.prerelease.length > 0 && (
        <>
          <Separator char="-" />
          <Part label="Pre-release" value={version.prerelease} style={PART_STYLES.prerelease} />
        </>
      )}
      {version.build.length > 0 && (
        <>
          <Separator char="+" />
          <Part label="Build" value={version.build} style={PART_STYLES.build} />
        </>
      )}
    </div>
  )
}

/** A labelled chip. Pre-release and build values are identifier lists and
 * render as one sub-chip per dot-separated identifier, so `alpha.1` shows
 * its two identifiers (which is what precedence compares) at a glance. */
function Part({ label, value, style }: { label: string; value: string | string[]; style: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5">
      {typeof value === 'string' ? (
        <span className={cn('rounded px-2 py-1 text-base font-semibold', style)}>{value}</span>
      ) : (
        <span className="flex flex-wrap items-center">
          {value.map((id, index) => (
            <span key={index} className="flex items-center">
              {index > 0 && <span className="px-px text-muted-foreground">.</span>}
              <span className={cn('rounded px-1.5 py-1 text-base font-semibold', style)}>{id}</span>
            </span>
          ))}
        </span>
      )}
      <span className="font-sans text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  )
}

function Separator({ char }: { char: string }) {
  return <span className="py-1 text-base text-muted-foreground">{char}</span>
}

function VersionNotes({ version }: { version: SemVer }) {
  const notes: string[] = []
  if (version.major === 0) notes.push('Major 0 is initial development: anything may change at any time.')
  if (version.prerelease.length) {
    notes.push(`Pre-release: unstable, and sorts before ${version.major}.${version.minor}.${version.patch}.`)
  }
  if (version.build.length) notes.push('Build metadata is ignored when comparing versions.')
  if (!notes.length) return null
  return (
    <ul className="space-y-0.5 text-muted-foreground">
      {notes.map((note) => (
        <li key={note} className="flex items-start gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {note}
        </li>
      ))}
    </ul>
  )
}

function RangeResult({
  version,
  sets,
  includePrerelease,
}: {
  version: SemVer | null
  sets: ComparatorSet[]
  includePrerelease: boolean
}) {
  const matches = version ? sets.map((set) => satisfiesSet(version, set, includePrerelease)) : []
  const satisfied = matches.some(Boolean)
  const blockedByPrerelease =
    version !== null && !satisfied && !includePrerelease && sets.some((set) => satisfiesSet(version, set, true))

  return (
    <div className="flex flex-col gap-1">
      {version ? (
        <p
          role="status"
          className={cn(
            'flex w-fit items-center gap-1 rounded px-1.5 py-0.5 font-medium',
            satisfied ? 'bg-success/15 text-success dark:bg-success/20' : 'bg-destructive/10 text-destructive',
          )}
        >
          {satisfied ? (
            <CircleCheck className="size-3.5" aria-hidden="true" />
          ) : (
            <CircleX className="size-3.5" aria-hidden="true" />
          )}
          {satisfied ? 'Version satisfies the range' : 'Version does not satisfy the range'}
        </p>
      ) : (
        <p className="text-muted-foreground">Enter a valid version to test it against this range.</p>
      )}
      {blockedByPrerelease && (
        <p className="text-muted-foreground">
          Pre-releases only match a comparator on the same MAJOR.MINOR.PATCH that also has a pre-release tag. Turn on
          "Include pre-releases" to relax this.
        </p>
      )}
      <ul className="space-y-0.5 font-mono" aria-label="Range breakdown">
        {sets.map((set, index) => (
          <li key={index} className="flex items-start gap-1.5">
            {version &&
              (matches[index] ? (
                <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-label="matches" />
              ) : (
                <CircleX className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="no match" />
              ))}
            <span className="min-w-0 break-all">
              <span className="text-foreground">{set.source}</span>
              <span className="text-muted-foreground"> means </span>
              <span className="text-foreground">{formatSet(set)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
