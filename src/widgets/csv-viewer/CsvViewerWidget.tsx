import { useMemo } from 'react'
import { Table2 } from 'lucide-react'
import { CodeEditor } from '@/components/CodeEditor'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { detectDelimiter, parseCsv, type CsvDelimiter } from './parseCsv'

type DelimiterSetting = 'auto' | CsvDelimiter

const DEFAULT_CSV = `name,role,department,salary
Ada Lovelace,Engineer,R&D,95000
Grace Hopper,Engineer,R&D,98000
Alan Turing,Researcher,Theory,92000`
const DEFAULT_DELIMITER: DelimiterSetting = 'auto'
const DEFAULT_FIRST_ROW_HEADER = true

// Keeps a very large paste responsive — the table is read-only, so there's
// no reason to mount thousands of <tr> rows at once just to prove they're
// there.
const MAX_DISPLAYED_ROWS = 1000

export default function CsvViewerWidget({ instanceId }: WidgetProps) {
  const [csvText, setCsvText] = useWidgetState(instanceId, 'csvText', DEFAULT_CSV)
  const [delimiterSetting, setDelimiterSetting] = useWidgetState<DelimiterSetting>(
    instanceId,
    'delimiter',
    DEFAULT_DELIMITER,
  )
  const [firstRowHeader, setFirstRowHeader] = useWidgetState(
    instanceId,
    'firstRowHeader',
    DEFAULT_FIRST_ROW_HEADER,
  )

  useWidgetDirty(
    instanceId,
    csvText !== DEFAULT_CSV || delimiterSetting !== DEFAULT_DELIMITER || firstRowHeader !== DEFAULT_FIRST_ROW_HEADER,
  )

  const rows = useMemo(() => {
    if (!csvText.trim()) return []
    const delimiter = delimiterSetting === 'auto' ? detectDelimiter(csvText) : delimiterSetting
    return parseCsv(csvText, delimiter)
  }, [csvText, delimiterSetting])

  const hasCsv = csvText.trim().length > 0
  const header = firstRowHeader && rows.length > 0 ? rows[0] : null
  const bodyRows = firstRowHeader && rows.length > 0 ? rows.slice(1) : rows
  const columnCount = (header ?? bodyRows[0] ?? []).length
  const headerCells = header ?? Array.from({ length: columnCount }, () => '')
  const displayedRows = bodyRows.slice(0, MAX_DISPLAYED_ROWS)
  const truncated = bodyRows.length > MAX_DISPLAYED_ROWS

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
            ]}
          />
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
        <p className="text-[10px] text-muted-foreground">
          {hasCsv
            ? `${bodyRows.length.toLocaleString()} row${bodyRows.length === 1 ? '' : 's'} × ${columnCount.toLocaleString()} column${columnCount === 1 ? '' : 's'}`
            : 'Table'}
        </p>
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
            Showing the first {MAX_DISPLAYED_ROWS.toLocaleString()} of {bodyRows.length.toLocaleString()} rows.
          </p>
        )}
      </div>
    </div>
  )
}
