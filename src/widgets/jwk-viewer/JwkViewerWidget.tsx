import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { JwkParseError, computeJwkThumbprint, parseJwkInput, type JwkResult, type ParsedJwk } from './jwk'

const MASK = '•'.repeat(24)

/** Best-effort short label for a key's summary line: kid first (that's what
 * it's for), falling back to the type/size summary for keys without one. */
function shortLabel(jwk: ParsedJwk): string {
  return jwk.kid ?? jwk.summary
}

export default function JwkViewerWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'input', '')
  useWidgetDirty(instanceId, input.length > 0)

  const { results, error } = useMemo(() => {
    if (!input.trim()) return { results: [] as JwkResult[], error: null as string | null }
    try {
      return { results: parseJwkInput(input), error: null }
    } catch (err) {
      const message = err instanceof JwkParseError || err instanceof Error ? err.message : 'Could not parse this key'
      return { results: [], error: message }
    }
  }, [input])

  const anyPrivate = results.some((result) => result.status === 'ok' && result.jwk.isPrivate)

  return (
    <div className="flex h-full flex-col gap-2">
      <Textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder='Paste a JWK ({"kty": …}) or a JWK Set ({"keys": [ … ]})…'
        spellCheck={false}
        className="h-16 w-full resize-none p-2 font-mono text-xs"
      />
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {anyPrivate && (
        // Raw amber, not the destructive token — this is a heads-up about
        // what the pasted data contains, not a parse failure.
        <p className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          Contains private/secret key material — treat this like a password.
        </p>
      )}
      {results.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto text-xs">
          {results.map((result, index) => {
            const label = results.length > 1 ? `Key ${index + 1} of ${results.length}` : null
            if (result.status === 'error') {
              // Index is fine — an error card carries no reveal/open state
              // that could leak between keys when the list is re-keyed.
              return <KeyErrorCard key={index} label={label} message={result.message} />
            }
            return (
              // Keyed on the key's own identity (kid, falling back to its
              // position) so pasting a different key at the same spot
              // resets its card's open/reveal state instead of inheriting
              // whatever the previous key's was.
              <KeyCard
                key={result.jwk.kid ?? `${index}:${result.jwk.kty}`}
                jwk={result.jwk}
                defaultOpen={index === 0}
                label={label}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function KeyErrorCard({ label, message }: { label: string | null; message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2">
      {label && <div className="mb-1 text-[10px] text-muted-foreground">{label}</div>}
      <ErrorMessage>{message}</ErrorMessage>
    </div>
  )
}

function KeyCard({ jwk, defaultOpen, label }: { jwk: ParsedJwk; defaultOpen: boolean; label: string | null }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <details open={defaultOpen} className="rounded-lg border border-border [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
        <div className="flex min-w-0 items-center gap-2">
          {label && <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>}
          <span className="truncate font-medium">{shortLabel(jwk)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {jwk.isPrivate && <Badge tone="destructive">Private</Badge>}
          {jwk.use && <Badge tone="muted">{jwk.use}</Badge>}
        </div>
      </summary>
      <div className="flex flex-col gap-1 border-t border-border p-2">
        <DetailRow label="Key" value={jwk.summary} mono={false} />
        {jwk.kid && <DetailRow label="Key ID (kid)" value={jwk.kid} />}
        {jwk.alg && <DetailRow label="Algorithm (alg)" value={jwk.alg} />}
        {jwk.use && (
          <DetailRow
            label="Use"
            value={jwk.use === 'sig' ? 'Signature' : jwk.use === 'enc' ? 'Encryption' : jwk.use}
            mono={false}
          />
        )}
        {jwk.keyOps && jwk.keyOps.length > 0 && (
          <div className="flex items-start justify-between gap-2 rounded px-1 py-1 hover:bg-accent">
            <span className="shrink-0 pt-0.5 text-muted-foreground">Key ops</span>
            <ChipList items={jwk.keyOps} />
          </div>
        )}

        <KeyMaterialRows jwk={jwk} revealed={revealed} />

        {jwk.isPrivate && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRevealed((prev) => !prev)}
            aria-pressed={revealed}
            className="h-auto w-fit gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {revealed ? 'Hide private material' : 'Reveal private material'}
          </Button>
        )}

        {jwk.x5t && <DetailRow label="x5t (X.509 SHA-1 thumbprint)" value={jwk.x5t} />}
        {jwk.x5tS256 && <DetailRow label="x5t#S256 (X.509 SHA-256 thumbprint)" value={jwk.x5tS256} />}
        {jwk.x5c && (
          <DetailRow
            label="x5c (X.509 chain)"
            value={`${jwk.x5c.length} certificate${jwk.x5c.length > 1 ? 's' : ''}`}
            mono={false}
          />
        )}

        <Thumbprint jwk={jwk} />
      </div>
    </details>
  )
}

/** The type-specific key-material rows — the public coordinates/modulus
 * always shown, the private components masked behind `revealed`. */
function KeyMaterialRows({ jwk, revealed }: { jwk: ParsedJwk; revealed: boolean }) {
  const raw = jwk.raw
  switch (jwk.kty) {
    case 'RSA':
      return (
        <>
          <DetailRow label="Modulus (n)" value={typeof raw.n === 'string' ? raw.n : ''} truncate />
          <DetailRow label="Exponent (e)" value={typeof raw.e === 'string' ? raw.e : ''} />
          {(['d', 'p', 'q', 'dp', 'dq', 'qi'] as const).map(
            (field) =>
              typeof raw[field] === 'string' && (
                <DetailRow
                  key={field}
                  label={field}
                  value={raw[field] as string}
                  sensitive
                  revealed={revealed}
                  truncate
                />
              ),
          )}
        </>
      )
    case 'EC':
      return (
        <>
          {jwk.curve && <DetailRow label="Curve (crv)" value={jwk.curve} mono={false} />}
          {typeof raw.x === 'string' && <DetailRow label="x" value={raw.x} truncate />}
          {typeof raw.y === 'string' && <DetailRow label="y" value={raw.y} truncate />}
          {typeof raw.d === 'string' && (
            <DetailRow label="d (private key)" value={raw.d} sensitive revealed={revealed} truncate />
          )}
        </>
      )
    case 'OKP':
      return (
        <>
          {jwk.curve && <DetailRow label="Curve (crv)" value={jwk.curve} mono={false} />}
          {typeof raw.x === 'string' && <DetailRow label="x" value={raw.x} truncate />}
          {typeof raw.d === 'string' && (
            <DetailRow label="d (private key)" value={raw.d} sensitive revealed={revealed} truncate />
          )}
        </>
      )
    case 'oct':
      return typeof raw.k === 'string' ? (
        <DetailRow label="k (secret)" value={raw.k} sensitive revealed={revealed} truncate />
      ) : null
    default:
      return null
  }
}

function DetailRow({
  label,
  value,
  mono = true,
  sensitive = false,
  revealed = true,
  truncate = false,
}: {
  label: string
  value: string
  mono?: boolean
  sensitive?: boolean
  revealed?: boolean
  truncate?: boolean
}) {
  const masked = sensitive && !revealed
  const displayValue = masked ? MASK : truncate && value.length > 44 ? `${value.slice(0, 44)}…` : value
  return (
    <div className="flex items-start justify-between gap-2 rounded px-1 py-1 hover:bg-accent">
      <span className="shrink-0 pt-0.5 text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-start gap-1">
        <span className={cn('min-w-0 text-right break-all', mono && 'font-mono')} title={masked ? undefined : value}>
          {displayValue || '—'}
        </span>
        {/* Masked values aren't copyable until revealed — the mask is the
         * only gate on this material, so a copy button would bypass it. */}
        {!masked && <CopyButton value={value} label="" ariaLabel={`Copy ${label}`} className="shrink-0 px-1" />}
      </div>
    </div>
  )
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {items.map((item) => (
        <span key={item} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px]">
          {item}
        </span>
      ))}
    </div>
  )
}

function Badge({ tone, children }: { tone: 'destructive' | 'muted'; children: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'destructive' && 'bg-destructive/10 text-destructive dark:bg-destructive/20',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

// Evaluated once at module load, not per-render — see the identical check in
// CertificateViewerWidget's Fingerprints for why.
const SUBTLE_CRYPTO_AVAILABLE = typeof crypto !== 'undefined' && !!crypto.subtle

/** Renders the RFC 7638 JWK thumbprint. Computed asynchronously via
 * WebCrypto (same pattern as CertificateViewerWidget's Fingerprints and
 * HashGeneratorWidget) rather than a bundled hash implementation. */
function Thumbprint({ jwk }: { jwk: ParsedJwk }) {
  const input = jwk.thumbprintInput
  // Both outcomes are tagged with the `input` they're for, so a stale
  // result — success *or* failure — from a since-replaced key is never
  // displayed. A KeyCard is keyed on kid alone, so editing a key's material
  // without changing its kid keeps this component mounted across inputs;
  // folding "failed" into this same keyed state (rather than a separate
  // boolean that would otherwise outlive the input it was set for) is what
  // lets a later, different input recover from an earlier rejection.
  const [attempt, setAttempt] = useState<
    { input: string; status: 'done'; thumbprint: string } | { input: string; status: 'failed' } | null
  >(null)

  useEffect(() => {
    if (!input || !SUBTLE_CRYPTO_AVAILABLE) return
    let cancelled = false
    computeJwkThumbprint(input)
      .then((thumbprint) => {
        if (!cancelled) setAttempt({ input, status: 'done', thumbprint })
      })
      .catch(() => {
        if (!cancelled) setAttempt({ input, status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [input])

  if (!input) return null

  const current = attempt?.input === input ? attempt : null
  const unavailable = !SUBTLE_CRYPTO_AVAILABLE || current?.status === 'failed'
  const thumbprint = current?.status === 'done' ? current.thumbprint : ''

  return <DetailRow label="Thumbprint (RFC 7638)" value={unavailable ? 'unavailable' : thumbprint} />
}
