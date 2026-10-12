import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Copy, Table2 } from 'lucide-react'
import { CodeEditor } from '@/components/CodeEditor'
import { SegmentedControl } from '@/components/SegmentedControl'
import { Button } from '@/components/ui/button'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { buildTableClipboardPayload } from './csvTableClipboard'
import { detectDelimiter, parseCsv, type CsvDelimiter } from './parseCsv'

type DelimiterSetting = 'auto' | CsvDelimiter | 'custom'
type CopyStatus = 'idle' | 'copied' | 'failed'

const DEFAULT_CSV = `name,role,department,salary
Ada Lovelace,Engineer,R&D,95000
Grace Hopper,Engineer,R&D,98000
Alan Turing,Researcher,Theory,92000`
const DEFAULT_DELIMITER: DelimiterSetting = 'auto'
const DEFAULT_CUSTOM_DELIMITER = ''
const DEFAULT_FIRST_ROW_HEADER = true

// Keeps a very large paste responsive — the table is read-only, so there's
// no reason to parse or mount thousands of rows at once just to prove
// they're there. parseCsv itself stops materializing rows past this cap
// (passed as maxRows below) while still counting the real total, so a huge
// paste doesn't pay to build and hold rows that will never be shown.
const MAX_DISPLAYED_ROWS = 1000

function resolveDelimiter(setting: DelimiterSetting, customDelimiter: string, csvText: string): string {
  if (setting === 'auto') return detectDelimiter(csvText)
  if (setting === 'custom') return customDelimiter || ','
  return setting
}

export default function CsvViewerWidget({ instanceId }: WidgetProps) {
  const [csvText, setCsvText] = useWidgetState(instanceId, 'csvText', DEFAULT_CSV)
  const [delimiterSetting, setDelimiterSetting] = useWidgetState<DelimiterSetting>(
    instanceId,
    'delimiter',
    DEFAULT_DELIMITER,
  )
  const [customDelimiter, setCustomDelimiter] = useWidgetState(instanceId, 'customDelimiter', DEFAULT_CUSTOM_DELIMITER)
  const [firstRowHeader, setFirstRowHeader] = useWidgetState(instanceId, 'firstRowHeader', DEFAULT_FIRST_ROW_HEADER)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(copyTimeoutRef.current), [])

  useWidgetDirty(
    instanceId,
    csvText !== DEFAULT_CSV ||
      delimiterSetting !== DEFAULT_DELIMITER ||
      customDelimiter !== DEFAULT_CUSTOM_DELIMITER ||
      firstRowHeader !== DEFAULT_FIRST_ROW_HEADER,
  )

  const parsed = useMemo(() => {
    if (!csvText.trim()) return { rows: [] as string[][], totalRows: 0 }
    const delimiter = resolveDelimiter(delimiterSetting, customDelimiter, csvText)
    return parseCsv(csvText, delimiter, MAX_DISPLAYED_ROWS + 1)
  }, [csvText, delimiterSetting, customDelimiter])

  const hasCsv = csvText.trim().length > 0
  const header = firstRowHeader && parsed.rows.length > 0 ? parsed.rows[0] : null
  const bodyRows = firstRowHeader && parsed.rows.length > 0 ? parsed.rows.slice(1) : parsed.rows
  const totalBodyRows = firstRowHeader ? Math.max(parsed.totalRows - 1, 0) : parsed.totalRows
  const columnCount = (header ?? bodyRows[0] ?? []).length
  const headerCells = header ?? Array.from({ length: columnCount }, () => '')
  const displayedRows = bodyRows.slice(0, MAX_DISPLAYED_ROWS)
  const truncated = totalBodyRows > MAX_DISPLAYED_ROWS

  const handleCopyTable = async () => {
    const { html, text } = buildTableClipboardPayload(headerCells, displayedRows)
    try {
      if (typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(text)
      }
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
    clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopyStatus('idle'), 1200)
  }

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">Delimiter</span>
          <SegmentedControl
            value={delimiterSetting}
            onChange={setDelimiterSetting}
            options={[
              { label: 'Auto', value: 'auto' },
              { label: ',', value: ',' },
              { label: ';', value: ';' },
              { label: 'Tab', value: '\t' },
              { label: 'Custom', value: 'custom' },
            ]}
          />
          {delimiterSetting === 'custom' && (
            <input
              type="text"
              value={customDelimiter}
              onChange={(event) => setCustomDelimiter(event.target.value.slice(0, 1))}
              placeholder="|"
              maxLength={1}
              aria-label="Custom delimiter character"
              className="h-6 w-10 rounded-md border border-border bg-background px-1.5 text-center font-mono text-xs text-foreground outline-none focus-visible:border-ring"
            />
          )}
        </div>
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <input
            type="checkbox"
            checked={firstRowHeader}
            onChange={(event) => setFirstRowHeader(event.target.checked)}
            className="accent-primary"
          />
          First row is header
        </label>
      </div>

      <CodeEditor
        value={csvText}
        onChange={setCsvText}
        language="plaintext"
        placeholder="Paste CSV or drop a file…"
        aria-label="CSV input"
        className="min-h-16 flex-1"
      />

      <div className="flex min-h-0 flex-[2] flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            {hasCsv
              ? `${totalBodyRows.toLocaleString()} row${totalBodyRows === 1 ? '' : 's'} × ${columnCount.toLocaleString()} column${columnCount === 1 ? '' : 's'}`
              : 'Table'}
          </p>
          {hasCsv && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleCopyTable}
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              {copyStatus === 'copied' ? (
                <Check className="size-3" />
              ) : copyStatus === 'failed' ? (
                <AlertTriangle className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
              {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy table'}
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          {hasCsv ? (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  {headerCells.map((cell, columnIndex) => (
                    <th
                      key={columnIndex}
                      className="sticky top-0 whitespace-nowrap border-b border-border bg-muted/70 px-2 py-1 font-medium text-foreground backdrop-blur-sm"
                    >
                      {cell || `Column ${columnIndex + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="odd:bg-muted/20 hover:bg-accent/40">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="whitespace-nowrap border-b border-border px-2 py-1">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="flex h-full items-center justify-center gap-1.5 text-muted-foreground">
              <Table2 className="size-3.5" />
              Paste CSV above to preview it as a table
            </p>
          )}
        </div>
        {truncated && (
          <p className="text-[10px] text-muted-foreground">
            Showing the first {MAX_DISPLAYED_ROWS.toLocaleString()} of {totalBodyRows.toLocaleString()} rows.
          </p>
        )}
      </div>
    </div>
  )
}
