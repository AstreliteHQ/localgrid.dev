import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContentTypeDetectorWidget from './ContentTypeDetectorWidget'

describe('ContentTypeDetectorWidget', () => {
  it('starts empty with a hint and no results', () => {
    render(<ContentTypeDetectorWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/paste something above/i)).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('identifies a UUID as soon as it is pasted', async () => {
    const user = userEvent.setup()
    render(<ContentTypeDetectorWidget instanceId="test" mode="grid" />)

    await user.type(screen.getByPlaceholderText(/paste text to identify/i), '550e8400-e29b-41d4-a716-446655440000')

    expect(screen.getByText('UUID')).toBeInTheDocument()
  })

  it('shows a Base64 -> JSON chain for base64-encoded JSON', async () => {
    const user = userEvent.setup()
    render(<ContentTypeDetectorWidget instanceId="test" mode="grid" />)

    await user.type(screen.getByPlaceholderText(/paste text to identify/i), btoa(JSON.stringify({ hello: 'world' })))

    expect(screen.getByText('Base64')).toBeInTheDocument()
    expect(screen.getByText('JSON')).toBeInTheDocument()
  })

  it('identifies a v2 addition, e.g. a MAC address', async () => {
    const user = userEvent.setup()
    render(<ContentTypeDetectorWidget instanceId="test" mode="grid" />)

    await user.type(screen.getByPlaceholderText(/paste text to identify/i), '00:1A:2B:3C:4D:5E')

    expect(screen.getByText('MAC address')).toBeInTheDocument()
  })

  it('does not crash on a single "z" (regression)', async () => {
    const user = userEvent.setup()
    render(<ContentTypeDetectorWidget instanceId="test" mode="grid" />)

    await user.type(screen.getByPlaceholderText(/paste text to identify/i), 'z')

    expect(screen.getByText('Plain text')).toBeInTheDocument()
  })
})
