import { useMemo } from 'react'
import { CodeEditor } from '@/components/CodeEditor'
import { CopyButton } from '@/components/CopyButton'
import { DataTree } from '@/components/data-tree/DataTree'
import { buildJsonTree } from '@/components/data-tree/treeModel'
import { ErrorMessage } from '@/components/ErrorMessage'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { decodePayload, toHex, type PayloadEncoding } from './payloadBytes'
import { decodeWithSchema, parseSchema } from './protoSchema'
import { decodeWireFormat, formatFields, WIRE_TYPE_NAMES, type WireField } from './wireFormat'

type Mode = 'raw' | 'schema'

/** A Person message: an id, a name, two repeated tags, and a nested
 * address. Enough shape to show what a schema-less decode can and cannot
 * recover, which is the point of the widget. */
const SAMPLE_PAYLOAD = 'CJYBEgd0ZXN0aW5nGgFhGgFiIgcKBVBhcmlz'

const SAMPLE_SCHEMA = `syntax = "proto3";

message Person {
  int32 id = 1;
  string name = 2;
  repeated string tags = 3;
  Address home = 4;
}

message Address {
  string city = 1;
}`

const SELECT_CLASS =
  'h-6 min-w-0 rounded-md border border-input bg-transparent px-1 text-[11px] outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 dark:bg-input/30'

const ENCODING_OPTIONS: { label: string; value: PayloadEncoding }[] = [
  { label: 'Auto', value: 'auto' },
  { label: 'Base64', value: 'base64' },
  { label: 'Hex', value: 'hex' },
]

export default function ProtobufDecoderWidget({ instanceId }: WidgetProps) {
  const [payload, setPayload] = useWidgetState(instanceId, 'payload', SAMPLE_PAYLOAD)
  const [encoding, setEncoding] = useWidgetState<PayloadEncoding>(instanceId, 'encoding', 'auto')
  const [mode, setMode] = useWidgetState<Mode>(instanceId, 'mode', 'raw')
  const [schema, setSchema] = useWidgetState(instanceId, 'schema', SAMPLE_SCHEMA)
  const [messageName, setMessageName] = useWidgetState(instanceId, 'messageName', '')
  useWidgetDirty(instanceId, payload !== SAMPLE_PAYLOAD || schema !== SAMPLE_SCHEMA || mode !== 'raw')

  const decodedPayload = useMemo(() => decodePayload(payload, encoding), [payload, encoding])
  const bytes = 'error' in decodedPayload ? null : decodedPayload.bytes

  const wire = useMemo(() => (bytes ? decodeWireFormat(bytes) : null), [bytes])
  const parsedSchema = useMemo(() => (mode === 'schema' ? parseSchema(schema) : null), [mode, schema])

  // Fall back to the first message the definition declares until one is
  // picked, so a freshly pasted .proto decodes without another click.
  const availableNames = parsedSchema?.ok ? parsedSchema.names : []
  const selectedName = availableNames.includes(messageName) ? messageName : (availableNames[0] ?? '')

  const schemaDecode = useMemo(() => {
    if (mode !== 'schema' || !bytes || !parsedSchema?.ok || !selectedName) return null
    return decodeWithSchema(parsedSchema.root, selectedName, bytes, wire?.fields ?? [])
  }, [mode, bytes, parsedSchema, selectedName, wire])

  const copyText = useMemo(() => {
    // Branching on the mode first matters: with a failed schema decode the
    // pane shows an error, and falling through to the wire rendering would
    // have the Copy button hand back output nobody can see.
    if (mode === 'schema') return schemaDecode?.ok ? JSON.stringify(schemaDecode.value, null, 2) : ''
    return wire ? formatFields(wire.fields) : ''
  }, [mode, schemaDecode, wire])

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <Textarea
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        placeholder="Paste a base64 or hex protobuf payload…"
        spellCheck={false}
        className="h-14 w-full shrink-0 resize-none p-2 font-mono text-xs"
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <SegmentedControl value={encoding} onChange={setEncoding} options={ENCODING_OPTIONS} />
        <SegmentedControl<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { label: 'No schema', value: 'raw' },
            { label: 'With .proto', value: 'schema' },
          ]}
        />
        {bytes && (
          <span className="ml-auto shrink-0 text-muted-foreground">
            {'error' in decodedPayload ? null : decodedPayload.encoding}, {bytes.length.toLocaleString('en-US')} bytes
          </span>
        )}
      </div>

      {'error' in decodedPayload ? (
        <div className="min-h-0 flex-1 rounded-lg border border-border bg-background p-2 dark:bg-muted/40">
          <ErrorMessage>{decodedPayload.error}</ErrorMessage>
        </div>
      ) : (
        <>
          {decodedPayload.grpcFrame && (
            <p className="text-muted-foreground">
              gRPC frame detected: skipped the 5-byte {decodedPayload.grpcFrame.compressed ? 'compressed' : 'length'}{' '}
              prefix.
              {decodedPayload.grpcFrame.compressed && ' The body is compressed, so this decode will not make sense.'}
            </p>
          )}

          {mode === 'schema' && (
            <>
              <CodeEditor
                value={schema}
                onChange={setSchema}
                language="plaintext"
                placeholder="Paste the .proto definition…"
                aria-label="Proto definition"
                className="min-h-16 flex-1 shrink-0"
              />
              <div className="flex items-center gap-1.5">
                <label htmlFor={`${instanceId}-message`} className="shrink-0 text-muted-foreground">
                  Message
                </label>
                <select
                  id={`${instanceId}-message`}
                  value={selectedName}
                  onChange={(event) => setMessageName(event.target.value)}
                  disabled={availableNames.length === 0}
                  className={cn(SELECT_CLASS, 'flex-1')}
                >
                  {availableNames.length === 0 ? (
                    <option value="">No message types</option>
                  ) : (
                    availableNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {mode === 'schema' ? 'Decoded with the definition' : 'Structure recovered from the bytes'}
            </span>
            <CopyButton value={copyText} className="ml-auto" />
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-background p-2 dark:bg-muted/40">
            {mode === 'schema' ? (
              <SchemaPane parsedSchema={parsedSchema} decode={schemaDecode} />
            ) : (
              <RawPane wire={wire} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function RawPane({ wire }: { wire: ReturnType<typeof decodeWireFormat> | null }) {
  if (!wire) return null
  return (
    <div className="flex flex-col gap-2">
      {wire.fields.length === 0 && wire.ok && <p className="text-muted-foreground">The payload holds no fields.</p>}
      {wire.fields.length > 0 && <FieldRows fields={wire.fields} depth={0} />}
      {!wire.ok && (
        <div className="flex flex-col gap-1">
          <ErrorMessage>
            {wire.reason} (byte {wire.offset})
          </ErrorMessage>
          {wire.fields.length > 0 && (
            <p className="text-muted-foreground">Everything above was read before that point.</p>
          )}
          <p className="text-muted-foreground">
            A payload that fails here is usually not protobuf, is truncated, or still carries a transport header.
          </p>
        </div>
      )}
      <p className="border-t border-border pt-2 text-muted-foreground">
        Without the .proto, names and declared types are not in the bytes: a varint could be an int32, a bool or an
        enum, and the readings below each value are all the payload can tell you.
      </p>
    </div>
  )
}

function FieldRows({ fields, depth }: { fields: WireField[]; depth: number }) {
  return (
    <ul className={cn('flex flex-col gap-0.5', depth > 0 && 'border-l border-border pl-2')}>
      {fields.map((field, index) => (
        <li key={`${field.offset}-${index}`} className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2 rounded px-1 py-0.5 hover:bg-accent">
            <span className="shrink-0 font-mono font-medium tabular-nums">{field.fieldNumber}</span>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {WIRE_TYPE_NAMES[field.wireType]}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono" title={primaryValue(field)}>
              {primaryValue(field)}
            </span>
          </div>
          {field.alternatives.length > 0 && (
            <p className="pl-1 text-[11px] text-muted-foreground">or {field.alternatives.join(' · ')}</p>
          )}
          {field.value.kind === 'message' && <FieldRows fields={field.value.fields} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

function primaryValue(field: WireField): string {
  const { value } = field
  switch (value.kind) {
    case 'varint':
      return String(value.value)
    case 'fixed64':
      return String(value.value)
    case 'fixed32':
      return String(value.value)
    case 'string':
      return JSON.stringify(value.text)
    case 'bytes':
      return value.bytes.length === 0 ? '(empty)' : toHex(value.bytes)
    case 'message':
      return `{ ${value.fields.length} field${value.fields.length === 1 ? '' : 's'} }`
  }
}

function SchemaPane({
  parsedSchema,
  decode,
}: {
  parsedSchema: ReturnType<typeof parseSchema> | null
  decode: ReturnType<typeof decodeWithSchema> | null
}) {
  if (parsedSchema && !parsedSchema.ok) {
    return (
      <ErrorMessage>
        {parsedSchema.line ? `Line ${parsedSchema.line}: ` : ''}
        {parsedSchema.reason}
      </ErrorMessage>
    )
  }
  if (!decode) return <p className="text-muted-foreground">Paste a .proto definition to name these fields.</p>
  if (!decode.ok) return <ErrorMessage>{decode.reason}</ErrorMessage>

  return (
    <div className="flex flex-col gap-2">
      {decode.comparison.unknownFieldNumbers.length > 0 && (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">
          Field{decode.comparison.unknownFieldNumbers.length === 1 ? '' : 's'}{' '}
          {decode.comparison.unknownFieldNumbers.join(', ')} on the wire
          {decode.comparison.unknownFieldNumbers.length === 1 ? ' is' : ' are'} not in this definition, and{' '}
          {decode.comparison.unknownFieldNumbers.length === 1 ? 'was' : 'were'} dropped. Switch to No schema to see{' '}
          {decode.comparison.unknownFieldNumbers.length === 1 ? 'it' : 'them'}.
        </p>
      )}
      {/* A declared field arriving as the wrong wire type is the clearest
       * sign the payload is a different message: protobufjs skips it in
       * silence, leaving a decode that looks clean and says nothing. */}
      {decode.comparison.mismatches.map((mismatch) => (
        <p key={mismatch.fieldNumber} className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">
          Field {mismatch.fieldNumber} arrived as {WIRE_TYPE_NAMES[mismatch.wireType]} but is declared{' '}
          {mismatch.declared}, so it was skipped. This payload is probably a different message type.
        </p>
      ))}
      <DataTree
        root={buildJsonTree(decode.value)}
        label="Decoded message"
        toolbar={false}
        statusBar={false}
        scroll={false}
      />
    </div>
  )
}
