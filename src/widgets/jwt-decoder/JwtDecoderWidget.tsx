import { useEffect, useId, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { DataTree } from '@/components/data-tree/DataTree'
import { buildJsonTree } from '@/components/data-tree/treeModel'
import { ErrorMessage } from '@/components/ErrorMessage'
import { Field } from '@/components/Field'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { InputSlot, OutputSlot } from '@/flow/FlowSlots'
import { useWidgetOutput } from '@/flow/useWidgetOutput'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'

type Mode = 'decode' | 'encode'

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLength = (4 - (normalized.length % 4)) % 4
  const binary = atob(normalized + '='.repeat(padLength))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

interface DecodedJwt {
  header: unknown
  payload: Record<string, unknown>
}

function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().split('.')
  if (parts.length !== 3) {
    throw new Error('A JWT has 3 dot-separated parts: header.payload.signature')
  }
  const [headerPart, payloadPart] = parts
  return {
    header: JSON.parse(base64UrlDecode(headerPart)) as unknown,
    payload: JSON.parse(base64UrlDecode(payloadPart)) as Record<
      string,
      unknown
    >,
  }
}

/** JSON-stringifies and base64url-encodes both sides — the unsigned
 * `header.payload` half of a token, shared by every alg (including
 * "none"). */
function encodeJwtParts(header: unknown, payload: unknown): string {
  const headerPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))
  const payloadPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  return `${headerPart}.${payloadPart}`
}

/** HS256 (HMAC-SHA256) is the only signing algorithm this widget produces a
 * real signature for — the common case for locally testing/minting tokens,
 * and the one alg Web Crypto's `HMAC` key type covers without pulling in an
 * asymmetric-crypto dependency for RS256/ES256 etc. */
async function signHS256(signingInput: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  return base64UrlEncode(new Uint8Array(signature))
}

interface EncodedState {
  token: string
  error: string | null
  /** Whether the header's `alg` is `"HS256"` — the only alg this widget
   * knows how to sign for. */
  isHS256: boolean
  /** Whether `token` actually got a real signature appended (isHS256 *and*
   * a non-empty secret) — distinct from `isHS256` since an HS256 header
   * with no secret yet is still unsigned, and needs its own hint wording. */
  isSigned: boolean
}

const DEFAULT_HEADER_JSON = '{\n  "alg": "HS256",\n  "typ": "JWT"\n}'
const DEFAULT_PAYLOAD_JSON = '{\n  "sub": "1234567890",\n  "name": "John Doe",\n  "iat": 1516239022\n}'
const EMPTY_ENCODED: EncodedState = { token: '', error: null, isHS256: false, isSigned: false }

export default function JwtDecoderWidget({ instanceId }: WidgetProps) {
  const [mode, setMode] = useWidgetState<Mode>(instanceId, 'mode', 'decode')

  // Decode
  const [token, setToken] = useWidgetState(instanceId, 'token', '')

  // Encode
  const [headerJson, setHeaderJson] = useWidgetState(instanceId, 'headerJson', DEFAULT_HEADER_JSON)
  const [payloadJson, setPayloadJson] = useWidgetState(instanceId, 'payloadJson', DEFAULT_PAYLOAD_JSON)
  const [secret, setSecret] = useWidgetState(instanceId, 'secret', '')
  const [encoded, setEncoded] = useWidgetState<EncodedState>(instanceId, 'encoded', EMPTY_ENCODED)

  useWidgetDirty(
    instanceId,
    token.length > 0 ||
      headerJson !== DEFAULT_HEADER_JSON ||
      payloadJson !== DEFAULT_PAYLOAD_JSON ||
      secret.length > 0,
  )

  const { decoded, error: decodeError } = useMemo(() => {
    if (!token.trim()) return { decoded: null, error: null as string | null }
    try {
      return { decoded: decodeJwt(token), error: null }
    } catch (err) {
      return {
        decoded: null,
        error: err instanceof Error ? err.message : 'Invalid token',
      }
    }
  }, [token])

  // Signing is async (Web Crypto), so this recomputes in an effect rather
  // than a useMemo — same shape as HashGeneratorWidget's computeHash effect.
  useEffect(() => {
    if (mode !== 'encode') return
    let cancelled = false
    async function run() {
      let header: unknown
      let payload: unknown
      try {
        header = JSON.parse(headerJson) as unknown
        payload = JSON.parse(payloadJson) as unknown
      } catch (err) {
        if (!cancelled) {
          setEncoded({
            token: '',
            error: err instanceof Error ? err.message : 'Invalid JSON',
            isHS256: false,
            isSigned: false,
          })
        }
        return
      }
      const alg = typeof header === 'object' && header !== null ? (header as Record<string, unknown>).alg : undefined
      const isHS256 = alg === 'HS256'
      const isSigned = isHS256 && !!secret
      try {
        const signingInput = encodeJwtParts(header, payload)
        const signature = isSigned ? await signHS256(signingInput, secret) : ''
        if (!cancelled) setEncoded({ token: `${signingInput}.${signature}`, error: null, isHS256, isSigned })
      } catch (err) {
        if (!cancelled) {
          setEncoded({
            token: '',
            error: err instanceof Error ? err.message : 'Failed to sign token',
            isHS256,
            isSigned: false,
          })
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [mode, headerJson, payloadJson, secret, setEncoded])
  // Decoding publishes the payload, encoding the signed token.
  useWidgetOutput(
    instanceId,
    mode === 'decode'
      ? decoded
        ? JSON.stringify(decoded.payload, null, 2)
        : ''
      : encoded.error
        ? ''
        : encoded.token,
  )

  const headerId = useId()
  const payloadId = useId()
  const secretId = useId()

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <SegmentedControl
        value={mode}
        onChange={setMode}
        options={[
          { label: 'Decode', value: 'decode' },
          { label: 'Encode', value: 'encode' },
        ]}
      />

      {mode === 'decode' ? (
        <>
          <InputSlot input="token">
            <Textarea
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste a JWT…"
              spellCheck={false}
              className="h-16 w-full resize-none p-2 font-mono text-xs"
            />
          </InputSlot>
          {decodeError && <ErrorMessage>{decodeError}</ErrorMessage>}
          {decoded && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
              {/* Keyed on the token so a freshly-decoded JWT gets a freshly
               * captured "now" — see ExpiryBadge for why this avoids an
               * effect. */}
              <ExpiryBadge key={token} payload={decoded.payload} />
              <JsonBlock title="Header" data={decoded.header} text={JSON.stringify(decoded.header, null, 2)} />
              <OutputSlot>
                <JsonBlock title="Payload" data={decoded.payload} text={JSON.stringify(decoded.payload, null, 2)} />
              </OutputSlot>
              <p className="text-[11px] text-muted-foreground">
                Signature not verified.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          <Field label="Header" htmlFor={headerId}>
            <Textarea
              id={headerId}
              value={headerJson}
              onChange={(event) => setHeaderJson(event.target.value)}
              spellCheck={false}
              className="h-16 w-full resize-none p-2 font-mono text-xs"
            />
          </Field>
          <Field label="Payload" htmlFor={payloadId}>
            <InputSlot input="payloadJson">
              <Textarea
                id={payloadId}
                value={payloadJson}
                onChange={(event) => setPayloadJson(event.target.value)}
                spellCheck={false}
                className="h-20 w-full resize-none p-2 font-mono text-xs"
              />
            </InputSlot>
          </Field>
          <Field label="Secret" htmlFor={secretId}>
            <Input
              id={secretId}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Leave blank for an unsigned token"
              spellCheck={false}
              className="font-mono"
            />
          </Field>

          {encoded.error ? (
            <ErrorMessage>{encoded.error}</ErrorMessage>
          ) : (
            <OutputSlot className="mt-auto">
              <Textarea
                readOnly
                value={encoded.token}
                spellCheck={false}
                className="h-16 w-full resize-none border-border bg-background p-2 pr-14 font-mono text-xs dark:bg-muted/40"
              />
              <CopyButton value={encoded.token} className="absolute right-1 top-1" />
            </OutputSlot>
          )}
          {!encoded.error && !encoded.isSigned && (
            <p className="text-[11px] text-muted-foreground">
              {encoded.isHS256
                ? 'Provide a secret above to sign the token or left blank for unsigned.'
                : 'Only HS256 signing is supported. Set "alg" to "HS256" above and provide a secret to sign the token.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** A JSON section with its own copy button — copies the formatted JSON text
 * directly, independent of whatever the tree view happens to have
 * collapsed. */
function JsonBlock({ title, data, text }: { title: string; data: unknown; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="font-medium text-muted-foreground">{title}</p>
        <CopyButton value={text} label="" ariaLabel={`Copy ${title.toLowerCase()}`} />
      </div>
      {typeof data === 'object' && data !== null ? (
        // Same tree as the JSON/XML widgets, without its own chrome or
        // scrollbox: these blocks are short and stack inside the panel's
        // own scroll area. It earns its place here for `iat`/`exp`, which
        // the tree annotates with the instant they decode to.
        <DataTree root={buildJsonTree(data)} label={`${title} tree`} toolbar={false} statusBar={false} scroll={false} />
      ) : (
        <pre className="font-mono text-xs">{JSON.stringify(data)}</pre>
      )}
    </div>
  )
}

/** Renders the exp-based valid/expired badge. "Now" is captured once via a
 * useState lazy initializer (React's sanctioned way to read an impure value
 * exactly once per mount) rather than in an effect; the parent remounts this
 * component by `key={token}` whenever a new JWT is decoded, so the captured
 * time stays pinned to when this token was pasted, not the badge's own
 * re-renders. */
function ExpiryBadge({ payload }: { payload: Record<string, unknown> }) {
  const [now] = useState(() => Date.now())
  const exp = payload.exp
  if (typeof exp !== 'number') return null

  const date = new Date(exp * 1000)
  const expired = date.getTime() < now

  return (
    <span
      className={cn(
        'w-fit rounded-full px-2 py-0.5 font-medium',
        expired
          ? 'bg-destructive/10 text-destructive dark:bg-destructive/20'
          : 'bg-success/15 text-success dark:bg-success/20',
      )}
    >
      {expired ? 'Expired' : 'Valid until'} {date.toLocaleString()}
    </span>
  )
}
