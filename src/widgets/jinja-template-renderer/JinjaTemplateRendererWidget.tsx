import { useMemo } from 'react'
import { SegmentedControl } from '@/components/SegmentedControl'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { CodeEditor } from '@/components/CodeEditor'
import { Textarea } from '@/components/ui/textarea'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { renderTemplate, type DataFormat } from './renderTemplate'

const SAMPLE_TEMPLATE = `Hello {{ name | capitalize }}!

Items:
{% for item in items %}
- {{ item }}
{% endfor %}`

const SAMPLE_DATA = `{
  "name": "ada",
  "items": ["json", "yaml", "jinja"]
}`

const DEFAULT_DATA_FORMAT: DataFormat = 'json'

const DATA_FORMAT_OPTIONS: { label: string; value: DataFormat }[] = [
  { label: 'JSON', value: 'json' },
  { label: 'YAML', value: 'yaml' },
]

export default function JinjaTemplateRendererWidget({ instanceId }: WidgetProps) {
  const [template, setTemplate] = useWidgetState(instanceId, 'template', SAMPLE_TEMPLATE)
  const [dataInput, setDataInput] = useWidgetState(instanceId, 'dataInput', SAMPLE_DATA)
  const [dataFormat, setDataFormat] = useWidgetState<DataFormat>(instanceId, 'dataFormat', DEFAULT_DATA_FORMAT)
  useWidgetDirty(
    instanceId,
    template !== SAMPLE_TEMPLATE || dataInput !== SAMPLE_DATA || dataFormat !== DEFAULT_DATA_FORMAT,
  )

  const { output, error } = useMemo(
    () => renderTemplate(template, dataInput, dataFormat),
    [template, dataInput, dataFormat],
  )

  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-2 text-xs">
      <div className="flex min-h-0 flex-col gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Template</p>
        <CodeEditor
          value={template}
          onChange={setTemplate}
          // No Jinja grammar is wired into CodeEditor, so this falls back
          // to plaintext — still gets line wrapping, just no highlighting.
          language="plaintext"
          placeholder="{{ Jinja template }}…"
          aria-label="Jinja template"
          className="min-h-0 flex-1"
        />
      </div>

      <div className="flex min-h-0 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Data</p>
          <SegmentedControl value={dataFormat} onChange={setDataFormat} options={DATA_FORMAT_OPTIONS} />
        </div>
        <CodeEditor
          value={dataInput}
          onChange={setDataInput}
          language={dataFormat === 'json' ? 'json' : 'plaintext'}
          placeholder={`Paste ${dataFormat === 'json' ? 'JSON' : 'YAML'}…`}
          aria-label="Template data"
          className="min-h-0 flex-1"
        />
      </div>

      <div className="flex min-h-0 flex-col gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Output</p>
        <div className="relative min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background p-2 dark:bg-muted/40">
          {error ? (
            <ErrorMessage>{error}</ErrorMessage>
          ) : !output ? (
            <p className="text-muted-foreground">Output will appear here</p>
          ) : (
            <>
              <Textarea
                readOnly
                value={output}
                spellCheck={false}
                aria-label="Rendered output"
                className="h-full w-full resize-none overflow-auto border-0 bg-transparent p-0 pr-14 font-mono text-xs"
              />
              <CopyButton value={output} className="absolute right-1 top-1 bg-inherit" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
