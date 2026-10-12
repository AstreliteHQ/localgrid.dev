/** Builds what gets written to the clipboard when copying the previewed
 * table, as both an HTML `<table>` (so pasting into an email, doc, or chat
 * keeps the grid structure) and a tab-separated plain-text fallback (for
 * pasting into a spreadsheet or anywhere that doesn't accept HTML). */

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface TableClipboardPayload {
  html: string
  text: string
}

export function buildTableClipboardPayload(headerCells: string[], bodyRows: string[][]): TableClipboardPayload {
  const headHtml = `<tr>${headerCells.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr>`
  const bodyHtml = bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  const html = `<table><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>`

  const text = [headerCells, ...bodyRows].map((row) => row.join('\t')).join('\n')

  return { html, text }
}
