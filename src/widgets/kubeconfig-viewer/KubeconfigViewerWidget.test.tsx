import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setCodeMirrorValue } from '@/test/codemirror'
import KubeconfigViewerWidget from './KubeconfigViewerWidget'

const SAMPLE = `
current-context: dev
clusters:
  - name: dev-cluster
    cluster:
      server: https://10.0.0.1:6443
      certificate-authority-data: ZmFrZS1jYQ==
contexts:
  - name: dev
    context:
      cluster: dev-cluster
      user: dev-user
      namespace: default
users:
  - name: dev-user
    user:
      client-certificate-data: ZmFrZS1jZXJ0
      client-key-data: ZmFrZS1rZXk=
`

function kubeconfigField() {
  return screen.getByRole('textbox', { name: /kubeconfig input/i })
}

/** jsdom implements neither the Clipboard nor ClipboardItem write path —
 * stub writeText the way CopyButton's own callers rely on in other widget
 * tests (it only ever calls navigator.clipboard.writeText). */
function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

describe('KubeconfigViewerWidget', () => {
  it('shows a placeholder before anything is pasted', () => {
    render(<KubeconfigViewerWidget instanceId="test" mode="grid" />)
    expect(screen.getByText(/see its contexts, clusters, and users/i)).toBeInTheDocument()
  })

  it('shows an error for text that is not a kubeconfig', () => {
    render(<KubeconfigViewerWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(kubeconfigField(), 'foo: bar')
    expect(screen.getByText(/no clusters, contexts, or users/i)).toBeInTheDocument()
  })

  it('summarizes the current context, clusters, contexts, and users', () => {
    render(<KubeconfigViewerWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(kubeconfigField(), SAMPLE)

    expect(screen.getByText('Current context: dev')).toBeInTheDocument()
    expect(screen.getAllByText('dev-cluster').length).toBeGreaterThan(0)
    // "dev-user" appears twice: once as the context's user cell, once as the
    // users table's own name cell.
    expect(screen.getAllByText('dev-user').length).toBe(2)
    expect(screen.getByText('current')).toBeInTheDocument()
    expect(screen.getByText('Client certificate')).toBeInTheDocument()
    expect(screen.getByText('CA pinned')).toBeInTheDocument()
  })

  it('flags an insecure cluster', () => {
    render(<KubeconfigViewerWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(
      kubeconfigField(),
      `clusters:\n  - name: dev\n    cluster:\n      server: https://x\n      insecure-skip-tls-verify: true\n`,
    )
    expect(screen.getByText(/insecure \(skip verify\)/i)).toBeInTheDocument()
  })

  it('warns about a dangling context reference', () => {
    render(<KubeconfigViewerWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(
      kubeconfigField(),
      `contexts:\n  - name: dev\n    context:\n      cluster: ghost\n      user: ghost\n`,
    )
    const issues = screen.getByRole('list', { name: /kubeconfig issues/i })
    expect(within(issues).getByText(/references undefined cluster "ghost"/)).toBeInTheDocument()
    expect(within(issues).getByText(/references undefined user "ghost"/)).toBeInTheDocument()
  })

  it('copies a credential-redacted kubeconfig to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = stubClipboard()
    render(<KubeconfigViewerWidget instanceId="test" mode="grid" />)

    setCodeMirrorValue(kubeconfigField(), SAMPLE)
    await user.click(screen.getByRole('button', { name: /copy sanitized kubeconfig/i }))

    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('REDACTED')
    expect(copied).not.toContain('ZmFrZS1jZXJ0')
    expect(copied).toContain('dev-cluster')
  })

  it('keeps its input across a remount of the same instance', () => {
    const { unmount } = render(<KubeconfigViewerWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(kubeconfigField(), 'current-context: dev\ncontexts:\n  - name: dev\n    context: {}\n')
    unmount()

    render(<KubeconfigViewerWidget instanceId="test" mode="grid" />)
    expect(screen.getByText('Current context: dev')).toBeInTheDocument()
  })
})
