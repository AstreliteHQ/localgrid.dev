import { useId, useMemo, type ReactNode } from 'react'
import { nanoid } from 'nanoid'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import {
  buildCurlCommand,
  buildWarnings,
  FLAG_DEFINITIONS,
  HTTP_METHODS,
  type AuthConfig,
  type AuthScheme,
  type BodyConfig,
  type BodyFormat,
  type CommandFormat,
  type CurlRequest,
  type FormFieldEntry,
  type HttpMethod,
  type KeyValueEntry,
} from './curlCommand'

// Stable references (never recreated on render) so an untouched field keeps
// pointing at the exact same default — that identity is how each field's
// own "has this been touched" check works below, the same trick
// JsonFormatterWidget uses by comparing its input against a SAMPLE string.
const DEFAULT_METHOD: HttpMethod = 'POST'
const DEFAULT_URL = 'https://api.example.com/v1/users'
const DEFAULT_HEADERS: KeyValueEntry[] = [{ id: 'default-header', name: 'Accept', value: 'application/json' }]
const DEFAULT_BODY: BodyConfig = {
  format: 'json',
  content: '{\n  "name": "Ada Lovelace",\n  "email": "ada@example.com"\n}',
}
const DEFAULT_FORMAT: CommandFormat = 'single-line'
const EMPTY_ENTRIES: KeyValueEntry[] = []
const EMPTY_FORM_FIELDS: FormFieldEntry[] = []
const EMPTY_FLAG_IDS: string[] = []

const BODY_FORMAT_OPTIONS: { label: string; value: BodyFormat }[] = [
  { label: 'JSON', value: 'json' },
  { label: 'URL-encoded', value: 'urlencoded' },
  { label: 'Raw', value: 'raw' },
]

const AUTH_SCHEME_OPTIONS: { label: string; value: AuthScheme }[] = [
  { label: 'Basic', value: 'basic' },
  { label: 'Bearer', value: 'bearer' },
]

const FORMAT_OPTIONS: { label: string; value: CommandFormat }[] = [
  { label: 'Single line', value: 'single-line' },
  { label: 'Multi-line', value: 'multi-line' },
]

function newEntry(): KeyValueEntry {
  return { id: nanoid(8), name: '', value: '' }
}

function newFormField(): FormFieldEntry {
  return { id: nanoid(8), name: '', value: '', isFile: false }
}

export default function CurlBuilderWidget({ instanceId }: WidgetProps) {
  const [method, setMethod] = useWidgetState<HttpMethod>(instanceId, 'method', DEFAULT_METHOD)
  const [url, setUrl] = useWidgetState(instanceId, 'url', DEFAULT_URL)
  const [headers, setHeaders] = useWidgetState(instanceId, 'headers', DEFAULT_HEADERS)
  const [queryParams, setQueryParams] = useWidgetState(instanceId, 'queryParams', EMPTY_ENTRIES)
  const [cookies, setCookies] = useWidgetState(instanceId, 'cookies', EMPTY_ENTRIES)
  const [formFields, setFormFields] = useWidgetState(instanceId, 'formFields', EMPTY_FORM_FIELDS)
  const [body, setBody] = useWidgetState<BodyConfig | null>(instanceId, 'body', DEFAULT_BODY)
  const [auth, setAuth] = useWidgetState<AuthConfig | null>(instanceId, 'auth', null)
  const [flagIds, setFlagIds] = useWidgetState(instanceId, 'flagIds', EMPTY_FLAG_IDS)
  const [format, setFormat] = useWidgetState<CommandFormat>(instanceId, 'format', DEFAULT_FORMAT)

  useWidgetDirty(
    instanceId,
    method !== DEFAULT_METHOD ||
      url !== DEFAULT_URL ||
      headers !== DEFAULT_HEADERS ||
      queryParams !== EMPTY_ENTRIES ||
      cookies !== EMPTY_ENTRIES ||
      formFields !== EMPTY_FORM_FIELDS ||
      body !== DEFAULT_BODY ||
      auth !== null ||
      flagIds !== EMPTY_FLAG_IDS ||
      format !== DEFAULT_FORMAT,
  )

  const urlId = useId()

  const request: CurlRequest = useMemo(
    () => ({ method, url, headers, queryParams, cookies, formFields, body, auth, flagIds }),
    [method, url, headers, queryParams, cookies, formFields, body, auth, flagIds],
  )

  const hasUrl = url.trim() !== ''
  const command = hasUrl ? buildCurlCommand(request, format) : ''
  const warnings = useMemo(() => buildWarnings(request), [request])

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex items-end gap-1.5">
        <SegmentedControl
          value={method}
          onChange={setMethod}
          options={HTTP_METHODS.map((m) => ({ label: m, value: m }))}
          className="flex-wrap"
        />
      </div>
      <Input
        id={urlId}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://api.example.com/resource"
        spellCheck={false}
        aria-label="URL"
        className="font-mono"
      />

      <div className="flex flex-wrap items-center gap-1">
        <AddBlockButton label="Header" onClick={() => setHeaders((prev) => [...prev, newEntry()])} />
        <AddBlockButton label="Query param" onClick={() => setQueryParams((prev) => [...prev, newEntry()])} />
        <AddBlockButton label="Cookie" onClick={() => setCookies((prev) => [...prev, newEntry()])} />
        <AddBlockButton label="Form field" onClick={() => setFormFields((prev) => [...prev, newFormField()])} />
        <AddBlockButton
          label="Body"
          disabled={body !== null}
          title={body !== null ? 'Remove the body block to add another' : undefined}
          onClick={() => setBody({ format: 'json', content: '' })}
        />
        <AddBlockButton
          label="Auth"
          disabled={auth !== null}
          title={auth !== null ? 'Remove the auth block to add another' : undefined}
          onClick={() => setAuth({ scheme: 'bearer', username: '', password: '', token: '' })}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {FLAG_DEFINITIONS.map((definition) => {
          const active = flagIds.includes(definition.id)
          return (
            <Button
              key={definition.id}
              type="button"
              title={definition.description}
              aria-pressed={active}
              onClick={() =>
                setFlagIds((prev) => (active ? prev.filter((id) => id !== definition.id) : [...prev, definition.id]))
              }
              className={cn(
                'h-auto rounded px-1.5 py-1 font-mono text-[11px]',
                active
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
              )}
            >
              {definition.flag}
            </Button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        {auth && (
          <BlockGroup label="Auth" onRemove={() => setAuth(null)}>
            <AuthFields auth={auth} onChange={setAuth} />
          </BlockGroup>
        )}

        {headers.length > 0 && (
          <BlockGroup label="Headers">
            {headers.map((header, index) => (
              <EntryRow
                key={header.id}
                entry={header}
                kind="Header"
                index={index}
                namePlaceholder="Header-Name"
                valuePlaceholder="value"
                onChange={(next) => setHeaders((prev) => prev.map((h) => (h.id === next.id ? next : h)))}
                onRemove={() => setHeaders((prev) => prev.filter((h) => h.id !== header.id))}
              />
            ))}
          </BlockGroup>
        )}

        {queryParams.length > 0 && (
          <BlockGroup label="Query params">
            {queryParams.map((param, index) => (
              <EntryRow
                key={param.id}
                entry={param}
                kind="Query param"
                index={index}
                namePlaceholder="name"
                valuePlaceholder="value"
                onChange={(next) => setQueryParams((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
                onRemove={() => setQueryParams((prev) => prev.filter((p) => p.id !== param.id))}
              />
            ))}
          </BlockGroup>
        )}

        {cookies.length > 0 && (
          <BlockGroup label="Cookies">
            {cookies.map((cookie, index) => (
              <EntryRow
                key={cookie.id}
                entry={cookie}
                kind="Cookie"
                index={index}
                namePlaceholder="name"
                valuePlaceholder="value"
                onChange={(next) => setCookies((prev) => prev.map((c) => (c.id === next.id ? next : c)))}
                onRemove={() => setCookies((prev) => prev.filter((c) => c.id !== cookie.id))}
              />
            ))}
          </BlockGroup>
        )}

        {formFields.length > 0 && (
          <BlockGroup label="Form fields">
            {formFields.map((field, index) => (
              <FormFieldRow
                key={field.id}
                field={field}
                index={index}
                onChange={(next) => setFormFields((prev) => prev.map((f) => (f.id === next.id ? next : f)))}
                onRemove={() => setFormFields((prev) => prev.filter((f) => f.id !== field.id))}
              />
            ))}
          </BlockGroup>
        )}

        {body && (
          <BlockGroup label="Body" onRemove={() => setBody(null)}>
            <SegmentedControl
              value={body.format}
              onChange={(next) => setBody({ ...body, format: next })}
              options={BODY_FORMAT_OPTIONS}
            />
            <Textarea
              value={body.content}
              onChange={(event) => setBody({ ...body, content: event.target.value })}
              placeholder="Request body…"
              spellCheck={false}
              aria-label="Body content"
              className="h-16 resize-none font-mono text-xs"
            />
          </BlockGroup>
        )}

        {headers.length === 0 &&
          queryParams.length === 0 &&
          cookies.length === 0 &&
          formFields.length === 0 &&
          !body &&
          !auth && <p className="p-1 text-muted-foreground">Add a block above to build up the request.</p>}
      </div>

      {warnings.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-border pt-1.5">
          {warnings.map((warning) => (
            <ErrorMessage key={warning}>{warning}</ErrorMessage>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 border-t border-border pt-2">
        <SegmentedControl value={format} onChange={setFormat} options={FORMAT_OPTIONS} />
        <CopyButton value={command} className="ml-auto" />
      </div>
      {!hasUrl ? (
        <ErrorMessage>Enter a URL to build the command</ErrorMessage>
      ) : (
        <pre className="max-h-32 shrink-0 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background p-2 font-mono text-[11px] text-foreground dark:bg-muted/40">
          {command}
        </pre>
      )}
    </div>
  )
}

function AddBlockButton({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <Button type="button" variant="outline" size="xs" onClick={onClick} disabled={disabled} title={title}>
      <Plus className="size-3" />
      {label}
    </Button>
  )
}

function BlockGroup({ label, onRemove, children }: { label: string; onRemove?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-1.5">
      <div className="flex items-center gap-2 px-0.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            aria-label={`Remove ${label.toLowerCase()} block`}
            className="ml-auto text-muted-foreground"
          >
            <X className="size-3" />
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function EntryRow({
  entry,
  kind,
  index,
  namePlaceholder,
  valuePlaceholder,
  onChange,
  onRemove,
}: {
  entry: KeyValueEntry
  /** Row kind ("Header", "Query param", "Cookie"), combined with `index`
   * into each field's accessible name — plain placeholder text repeats
   * identically across every row of a kind, which would otherwise give
   * several inputs on the page the exact same accessible name. */
  kind: string
  index: number
  namePlaceholder: string
  valuePlaceholder: string
  onChange: (next: KeyValueEntry) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        value={entry.name}
        onChange={(event) => onChange({ ...entry, name: event.target.value })}
        placeholder={namePlaceholder}
        spellCheck={false}
        aria-label={`${kind} ${index + 1} name`}
        className="h-7 min-w-0 flex-1 font-mono text-[11px]"
      />
      <Input
        value={entry.value}
        onChange={(event) => onChange({ ...entry, value: event.target.value })}
        placeholder={valuePlaceholder}
        spellCheck={false}
        aria-label={`${kind} ${index + 1} value`}
        className="h-7 min-w-0 flex-1 font-mono text-[11px]"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        aria-label="Remove"
        className="shrink-0 text-muted-foreground"
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}

function FormFieldRow({
  field,
  index,
  onChange,
  onRemove,
}: {
  field: FormFieldEntry
  index: number
  onChange: (next: FormFieldEntry) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        value={field.name}
        onChange={(event) => onChange({ ...field, name: event.target.value })}
        placeholder="name"
        spellCheck={false}
        aria-label={`Form field ${index + 1} name`}
        className="h-7 min-w-0 flex-1 font-mono text-[11px]"
      />
      <Input
        value={field.value}
        onChange={(event) => onChange({ ...field, value: event.target.value })}
        placeholder={field.isFile ? 'path/to/file' : 'value'}
        spellCheck={false}
        aria-label={`Form field ${index + 1} value`}
        className="h-7 min-w-0 flex-1 font-mono text-[11px]"
      />
      <Button
        type="button"
        aria-pressed={field.isFile}
        title="Send as a file (-F name=@value)"
        onClick={() => onChange({ ...field, isFile: !field.isFile })}
        className={cn(
          'h-7 shrink-0 rounded px-1.5 text-[11px] font-medium',
          field.isFile
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-secondary text-muted-foreground hover:bg-secondary/80',
        )}
      >
        File
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        aria-label="Remove"
        className="shrink-0 text-muted-foreground"
      >
        <X className="size-3" />
      </Button>
    </div>
  )
}

function AuthFields({ auth, onChange }: { auth: AuthConfig; onChange: (next: AuthConfig) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <SegmentedControl
        value={auth.scheme}
        onChange={(scheme) => onChange({ ...auth, scheme })}
        options={AUTH_SCHEME_OPTIONS}
      />
      {auth.scheme === 'basic' ? (
        <div className="flex items-center gap-1">
          <Input
            value={auth.username}
            onChange={(event) => onChange({ ...auth, username: event.target.value })}
            placeholder="username"
            spellCheck={false}
            aria-label="Basic auth username"
            className="h-7 min-w-0 flex-1 font-mono text-[11px]"
          />
          <Input
            value={auth.password}
            onChange={(event) => onChange({ ...auth, password: event.target.value })}
            placeholder="password"
            type="password"
            spellCheck={false}
            aria-label="Basic auth password"
            className="h-7 min-w-0 flex-1 font-mono text-[11px]"
          />
        </div>
      ) : (
        <Input
          value={auth.token}
          onChange={(event) => onChange({ ...auth, token: event.target.value })}
          placeholder="token"
          spellCheck={false}
          aria-label="Bearer token"
          className="h-7 font-mono text-[11px]"
        />
      )}
    </div>
  )
}
