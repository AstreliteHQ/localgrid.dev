import { describe, expect, it } from 'vitest'
import { cycleLineMark, toggleLineMark, type LineMarkSets } from './lineMarks'

function marks(highlighted: number[] = [], blurred: number[] = []): LineMarkSets {
  return { highlighted: new Set(highlighted), blurred: new Set(blurred) }
}

describe('cycleLineMark', () => {
  it('marks an unmarked line as highlighted', () => {
    const next = cycleLineMark(2, marks())
    expect(next.highlighted).toEqual(new Set([2]))
    expect(next.blurred).toEqual(new Set())
  })

  it('moves a highlighted line to blurred', () => {
    const next = cycleLineMark(2, marks([2]))
    expect(next.highlighted).toEqual(new Set())
    expect(next.blurred).toEqual(new Set([2]))
  })

  it('clears a blurred line back to unmarked', () => {
    const next = cycleLineMark(2, marks([], [2]))
    expect(next.highlighted).toEqual(new Set())
    expect(next.blurred).toEqual(new Set())
  })

  it('leaves other lines untouched', () => {
    const next = cycleLineMark(2, marks([1, 2], [3]))
    expect(next.highlighted).toEqual(new Set([1]))
    expect(next.blurred).toEqual(new Set([2, 3]))
  })
})

describe('toggleLineMark', () => {
  it('highlights every given line when none of them are highlighted yet', () => {
    const next = toggleLineMark([1, 2], 'highlight', marks())
    expect(next.highlighted).toEqual(new Set([1, 2]))
  })

  it('clears the highlight from every given line once all of them are highlighted', () => {
    const next = toggleLineMark([1, 2], 'highlight', marks([1, 2]))
    expect(next.highlighted).toEqual(new Set())
  })

  it('highlights every given line when only some of them are already highlighted', () => {
    const next = toggleLineMark([1, 2, 3], 'highlight', marks([1]))
    expect(next.highlighted).toEqual(new Set([1, 2, 3]))
  })

  it('removes a conflicting blur mark from lines it highlights', () => {
    const next = toggleLineMark([1, 2], 'highlight', marks([], [2]))
    expect(next.highlighted).toEqual(new Set([1, 2]))
    expect(next.blurred).toEqual(new Set())
  })

  it('blurs every given line and clears a conflicting highlight mark', () => {
    const next = toggleLineMark([1, 2], 'blur', marks([2]))
    expect(next.blurred).toEqual(new Set([1, 2]))
    expect(next.highlighted).toEqual(new Set())
  })

  it('clears the blur from every given line once all of them are blurred', () => {
    const next = toggleLineMark([1, 2], 'blur', marks([], [1, 2]))
    expect(next.blurred).toEqual(new Set())
  })

  it('is a no-op for an empty line list', () => {
    const current = marks([1], [2])
    expect(toggleLineMark([], 'highlight', current)).toBe(current)
  })
})
