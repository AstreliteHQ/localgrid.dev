import { useMemo } from 'react'
import { Check, X } from 'lucide-react'
import { CodeEditor } from '@/components/CodeEditor'
import { ErrorMessage } from '@/components/ErrorMessage'
import { SegmentedControl } from '@/components/SegmentedControl'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { validateJsonSchema, type DocumentFormat } from './validateJsonSchema'

const DEFAULT_FORMAT: DocumentFormat = 'json'

const DEFAULT_SCHEMA = `{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "name": { "type": "string" },
    "age": { "type": "integer", "minimum": 0 }
  },
  "required": ["id", "name"],
  "additionalProperties": false
}`

const DEFAULT_DOCUMENT = `{
  "id": "8f14e45f-ea8b-4f1e-9c0a-2b6d7c3e5a91",
  "name": "Ada Lovelace",
  "age": 36
}`

export default function JsonSchemaValidatorWidget({ instanceId }: WidgetProps) {
  const [format, setFormat] = useWidgetState<DocumentFormat>(instanceId, 'format', DEFAULT_FORMAT)
  const [schemaText, setSchemaText] = useWidgetState(instanceId, 'schemaText', DEFAULT_SCHEMA)
  const [documentText, setDocumentText] = useWidgetState(instanceId, 'documentText', DEFAULT_DOCUMENT)

  useWidgetDirty(
    instanceId,
    format !== DEFAULT_FORMAT || schemaText !== DEFAULT_SCHEMA || documentText !== DEFAULT_DOCUMENT,
  )

  const outcome = useMemo(
    () => validateJsonSchema(schemaText, documentText, format),
    [schemaText, documentText, format],
  )

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Schema (JSON)</p>
        <CodeEditor
          value={schemaText}
          onChange={setSchemaText}
          language="json"
          placeholder="Paste a JSON Schema…"
          aria-label="JSON Schema"
          className="min-h-0 flex-1"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Document</p>
          <SegmentedControl
            value={format}
            onChange={setFormat}
            options={[
              { label: 'JSON', value: 'json' },
              { label: 'YAML', value: 'yaml' },
            ]}
          />
        </div>
        <CodeEditor
          value={documentText}
          onChange={setDocumentText}
          // No YAML grammar is wired into CodeEditor, so the YAML side
          // falls back to plaintext (still gets line wrapping, just no
          // highlighting) — same tradeoff YamlJsonConverterWidget makes.
          language={format === 'json' ? 'json' : 'plaintext'}
          placeholder={`Paste ${format === 'json' ? 'JSON' : 'YAML'} to validate…`}
          aria-label="Document to validate"
          className="min-h-0 flex-1"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Result</p>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-background p-2 dark:bg-muted/40">
          {outcome.status === 'empty' && (
            <p className="text-muted-foreground">Paste a schema and a document to validate it.</p>
          )}
          {outcome.status === 'schema-error' && <ErrorMessage>Schema error: {outcome.message}</ErrorMessage>}
          {outcome.status === 'document-error' && <ErrorMessage>Document error: {outcome.message}</ErrorMessage>}
          {outcome.status === 'valid' && (
            <div className="flex items-center gap-1.5 rounded bg-success/15 px-2 py-1.5 text-success dark:bg-success/20">
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
              Document matches the schema.
            </div>
          )}
          {outcome.status === 'invalid' && (
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" aria-label="Validation issues">
              {outcome.issues.map((issue, index) => (
                <li
                  key={index}
                  className={cn(
                    'flex items-start gap-1.5 rounded px-1.5 py-1 text-destructive',
                    'bg-destructive/10 dark:bg-destructive/20',
                  )}
                >
                  <X className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {issue.line != null && <span className="font-mono font-semibold">Line {issue.line}:</span>}{' '}
                    <span className="font-mono">{issue.path}</span> {issue.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
