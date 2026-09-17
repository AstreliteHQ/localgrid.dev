import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CurlBuilderWidget from './CurlBuilderWidget'

function preview() {
  return screen.getByText(/^curl /).textContent
}

function copyButton() {
  return screen.getByRole('button', { name: /^copy$/i })
}

describe('CurlBuilderWidget', () => {
  it('opens on a sample request that already produces a full command', () => {
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    expect(screen.getByRole('button', { name: 'POST' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('URL')).toHaveValue('https://api.example.com/v1/users')

    const command = preview()
    expect(command).toContain('curl -X POST')
    expect(command).toContain("-H 'Accept: application/json'")
    // The sample body is JSON and carries no Content-Type header of its
    // own, so one is added automatically.
    expect(command).toContain("-H 'Content-Type: application/json'")
    expect(command).toContain('Ada Lovelace')
    expect(command).toContain("'https://api.example.com/v1/users'")
  })

  it('adds a header block and reflects it in the command as soon as it is filled in', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    // The sample already opens with one header ("Accept"), so the freshly
    // added block is the second row.
    await user.click(screen.getByRole('button', { name: 'Header' }))
    await user.type(screen.getByLabelText('Header 2 name'), 'X-Trace-Id')
    await user.type(screen.getByLabelText('Header 2 value'), 'abc123')

    expect(preview()).toContain("-H 'X-Trace-Id: abc123'")
  })

  it('removes a header row and drops it from the command', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    expect(preview()).toContain('Accept')
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(preview()).not.toContain('Accept')
    expect(screen.queryByText('Headers')).not.toBeInTheDocument()
  })

  it('appends query parameters to the url', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /query param/i }))
    await user.type(screen.getByLabelText('Query param 1 name'), 'page')
    await user.type(screen.getByLabelText('Query param 1 value'), '2')

    expect(preview()).toContain("'https://api.example.com/v1/users?page=2'")
  })

  it('combines several cookies into one -b flag', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /cookie/i }))
    await user.click(screen.getByRole('button', { name: /cookie/i }))
    await user.type(screen.getByLabelText('Cookie 1 name'), 'session')
    await user.type(screen.getByLabelText('Cookie 2 name'), 'theme')

    const command = preview()
    expect(command).toContain("-b 'session=; theme='")
    expect(command?.match(/-b /g)).toHaveLength(1)
  })

  it('marks a form field as a file upload', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /form field/i }))
    await user.type(screen.getByLabelText('Form field 1 name'), 'avatar')
    await user.type(screen.getByLabelText('Form field 1 value'), 'me.png')
    // The toggle's accessible name is its visible text ("File"); the
    // longer "Send as a file" description lives in its title tooltip.
    await user.click(screen.getByRole('button', { name: 'File' }))

    expect(preview()).toContain("-F 'avatar=@me.png'")
  })

  it('disables adding a second body block, and removing the first re-enables it', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    // The sample already opens with a body block.
    expect(screen.getByRole('button', { name: /^body$/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Remove body block' }))
    expect(screen.getByRole('button', { name: /^body$/i })).toBeEnabled()
    expect(preview()).not.toContain('-d ')
  })

  it('adds bearer auth as an Authorization header', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /^auth$/i }))
    await user.type(screen.getByLabelText('Bearer token'), 'tok_123')

    expect(preview()).toContain("-H 'Authorization: Bearer tok_123'")
    expect(screen.getByRole('button', { name: /^auth$/i })).toBeDisabled()
  })

  it('switches to basic auth and sends -u user:pass', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    await user.click(screen.getByRole('button', { name: /^auth$/i }))
    await user.click(screen.getByRole('button', { name: 'Basic' }))
    await user.type(screen.getByLabelText('Basic auth username'), 'alice')
    await user.type(screen.getByLabelText('Basic auth password'), 'secret')

    expect(preview()).toContain("-u 'alice:secret'")
  })

  it('toggles a flag on and off, by its readable label rather than its raw option', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    const flag = screen.getByRole('button', { name: 'Follow redirects' })
    expect(flag).toHaveAttribute('title', expect.stringContaining('-L'))
    expect(flag).toHaveAttribute('aria-pressed', 'false')

    await user.click(flag)
    expect(flag).toHaveAttribute('aria-pressed', 'true')
    expect(preview()).toContain(' -L ')

    await user.click(flag)
    expect(flag).toHaveAttribute('aria-pressed', 'false')
    expect(preview()).not.toContain(' -L ')
  })

  it('warns when both an Authorization header and the auth block are set', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    // Header 2: the sample already carries an "Accept" header as row 1.
    await user.click(screen.getByRole('button', { name: 'Header' }))
    await user.type(screen.getByLabelText('Header 2 name'), 'Authorization')
    await user.type(screen.getByLabelText('Header 2 value'), 'Bearer manual')
    await user.click(screen.getByRole('button', { name: /^auth$/i }))
    await user.type(screen.getByLabelText('Bearer token'), 'auto')

    expect(screen.getByText(/both set; curl will send both/i)).toBeInTheDocument()
  })

  it('switches between single-line and multi-line formatting', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    // The sample body is itself multi-line JSON, so its quoted -d value
    // legitimately contains newlines even in single-line mode; what
    // distinguishes the two formats is the backslash-continuation join.
    expect(preview()).not.toContain(' \\\n')

    await user.click(screen.getByRole('button', { name: 'Multi-line' }))
    const command = preview()
    expect(command?.startsWith('curl \\')).toBe(true)
    expect(command).toContain(' \\\n')
  })

  it('shows an error and disables copy when the url is empty', async () => {
    const user = userEvent.setup()
    render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    await user.clear(screen.getByLabelText('URL'))

    expect(screen.getByText(/enter a url/i)).toBeInTheDocument()
    expect(copyButton()).toBeDisabled()
  })

  it('keeps its request across a remount of the same instance', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<CurlBuilderWidget instanceId="test" mode="grid" />)

    await user.clear(screen.getByLabelText('URL'))
    await user.type(screen.getByLabelText('URL'), 'https://example.com/widgets')
    await user.click(screen.getByRole('button', { name: 'GET' }))
    unmount()

    render(<CurlBuilderWidget instanceId="test" mode="grid" />)
    expect(screen.getByLabelText('URL')).toHaveValue('https://example.com/widgets')
    expect(screen.getByRole('button', { name: 'GET' })).toHaveAttribute('aria-pressed', 'true')
  })
})
