import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CodeEditor } from './CodeEditor'

function fileTransfer(...files: File[]) {
  return { types: ['Files'], files, dropEffect: 'none' }
}

function Harness({
  initial = '',
  readOnly = false,
  onChange = () => {},
}: {
  initial?: string
  readOnly?: boolean
  onChange?: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <CodeEditor
      aria-label="Input"
      value={value}
      readOnly={readOnly}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

function editorWrapper() {
  return document.querySelector('[data-slot="code-editor"]') as HTMLElement
}

describe('CodeEditor file drop', () => {
  it('replaces the content with the dropped file text', async () => {
    const onChange = vi.fn()
    render(<Harness initial="old content" onChange={onChange} />)
    fireEvent.drop(screen.getByRole('textbox', { name: 'Input' }), {
      dataTransfer: fileTransfer(new File(['{"a":1}'], 'data.json')),
    })
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('{"a":1}'))
    expect(screen.getByRole('textbox', { name: 'Input' })).toHaveTextContent('{"a":1}')
  })

  it('shows a drop hint while a file is dragged over', () => {
    render(<Harness />)
    fireEvent.dragOver(editorWrapper(), { dataTransfer: fileTransfer() })
    expect(screen.getByText('Drop a file to load its text')).toBeInTheDocument()
    fireEvent.dragLeave(editorWrapper(), { relatedTarget: document.body })
    expect(screen.queryByText('Drop a file to load its text')).not.toBeInTheDocument()
  })

  it('shows an error and keeps the content for a binary file', async () => {
    const onChange = vi.fn()
    render(<Harness initial="keep me" onChange={onChange} />)
    fireEvent.drop(editorWrapper(), {
      dataTransfer: fileTransfer(new File([new Uint8Array([0, 1, 2, 3])], 'image.png')),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('image.png is not a plain text file.')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores file drops when read-only', async () => {
    const onChange = vi.fn()
    render(<Harness initial="output" readOnly onChange={onChange} />)
    fireEvent.dragOver(editorWrapper(), { dataTransfer: fileTransfer() })
    expect(screen.queryByText('Drop a file to load its text')).not.toBeInTheDocument()
    fireEvent.drop(editorWrapper(), { dataTransfer: fileTransfer(new File(['new'], 'a.txt')) })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(onChange).not.toHaveBeenCalled()
  })
})
