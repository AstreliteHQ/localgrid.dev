/** Pure state-transition helpers for the per-line highlight/blur marks the
 * code snippet widget's gutter and keyboard-shortcut interactions apply,
 * kept separate from the CodeMirror extension and the widget component so
 * the transition logic itself is easy to unit test without a real editor. */

export interface LineMarkSets {
  highlighted: Set<number>
  blurred: Set<number>
}

/** Clicking a line number cycles it through: unmarked -> highlighted ->
 * blurred -> unmarked. */
export function cycleLineMark(lineNumber: number, marks: LineMarkSets): LineMarkSets {
  const highlighted = new Set(marks.highlighted)
  const blurred = new Set(marks.blurred)
  if (highlighted.has(lineNumber)) {
    highlighted.delete(lineNumber)
    blurred.add(lineNumber)
  } else if (blurred.has(lineNumber)) {
    blurred.delete(lineNumber)
  } else {
    highlighted.add(lineNumber)
  }
  return { highlighted, blurred }
}

/** A keyboard shortcut toggles every given line at once: if all of them
 * already carry `kind`'s mark, it clears that mark from all of them;
 * otherwise it applies the mark to all of them, removing the other mark
 * from any line that had it so a line never carries both. */
export function toggleLineMark(lineNumbers: number[], kind: 'highlight' | 'blur', marks: LineMarkSets): LineMarkSets {
  if (lineNumbers.length === 0) return marks
  const target = new Set(kind === 'highlight' ? marks.highlighted : marks.blurred)
  const other = new Set(kind === 'highlight' ? marks.blurred : marks.highlighted)
  const allMarked = lineNumbers.every((line) => target.has(line))
  for (const line of lineNumbers) {
    if (allMarked) {
      target.delete(line)
    } else {
      target.add(line)
      other.delete(line)
    }
  }
  return kind === 'highlight' ? { highlighted: target, blurred: other } : { highlighted: other, blurred: target }
}
