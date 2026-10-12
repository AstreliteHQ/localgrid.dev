import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { setCodeMirrorValue } from '@/test/codemirror'
import K8sResourceCalculatorWidget from './K8sResourceCalculatorWidget'

function manifestField() {
  return screen.getByRole('textbox', { name: /kubernetes manifest input/i })
}

describe('K8sResourceCalculatorWidget', () => {
  it('totals the sample manifest it opens with across containers and init containers', () => {
    render(<K8sResourceCalculatorWidget instanceId="test" mode="grid" />)

    // initContainers: migrate 100m/128Mi req, 200m/256Mi limit
    // containers: api 250m/256Mi req 500m/512Mi limit, sidecar 50m/64Mi req 100m/128Mi limit
    expect(screen.getByText('400m')).toBeInTheDocument() // CPU requests: 100+250+50
    expect(screen.getByText('800m')).toBeInTheDocument() // CPU limits: 200+500+100
    expect(screen.getByText('448Mi')).toBeInTheDocument() // Memory requests: 128+256+64
    expect(screen.getByText('896Mi')).toBeInTheDocument() // Memory limits: 256+512+128

    const table = screen.getByRole('table')
    expect(within(table).getByRole('cell', { name: 'migrate' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: 'Init container' })).toBeInTheDocument()
    expect(within(table).getAllByRole('cell', { name: 'Container' })).toHaveLength(2)
  })

  it('shows a placeholder once the input is cleared', () => {
    render(<K8sResourceCalculatorWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(manifestField(), '')
    expect(screen.getByText(/paste a manifest to total/i)).toBeInTheDocument()
  })

  it('shows a friendly empty state for a manifest with no containers', () => {
    render(<K8sResourceCalculatorWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(manifestField(), 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: config\n')
    expect(screen.getByText(/no containers found/i)).toBeInTheDocument()
  })

  it('sums across multiple --- separated manifests', () => {
    render(<K8sResourceCalculatorWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(
      manifestField(),
      [
        'apiVersion: v1',
        'kind: Pod',
        'metadata:',
        '  name: a',
        'spec:',
        '  containers:',
        '    - name: a',
        '      resources:',
        '        requests: { cpu: 100m }',
        '---',
        'apiVersion: v1',
        'kind: Pod',
        'metadata:',
        '  name: b',
        'spec:',
        '  containers:',
        '    - name: b',
        '      resources:',
        '        requests: { cpu: 200m }',
        '',
      ].join('\n'),
    )
    expect(screen.getByText('300m')).toBeInTheDocument()
  })

  it('shows a dash for resource fields a container did not set', () => {
    render(<K8sResourceCalculatorWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(
      manifestField(),
      [
        'apiVersion: v1',
        'kind: Pod',
        'metadata:',
        '  name: bare',
        'spec:',
        '  containers:',
        '    - name: app',
        '',
      ].join('\n'),
    )
    const table = screen.getByRole('table')
    const dashes = within(table).getAllByRole('cell', { name: '—' })
    expect(dashes.length).toBe(4) // CPU req, CPU limit, Mem req, Mem limit
  })

  it('surfaces a parse error for a malformed document without losing the other rows', () => {
    render(<K8sResourceCalculatorWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(
      manifestField(),
      [
        'apiVersion: v1',
        'kind: Pod',
        'metadata:',
        '  name: broken',
        'spec: [unterminated',
        '---',
        'apiVersion: v1',
        'kind: Pod',
        'metadata:',
        '  name: ok',
        'spec:',
        '  containers:',
        '    - name: ok',
        '      resources:',
        '        requests: { cpu: 100m }',
        '',
      ].join('\n'),
    )
    expect(screen.getByRole('list', { name: /parse errors/i })).toBeInTheDocument()
    // "ok" appears twice: once as the resource name cell, once as the
    // container name cell.
    expect(screen.getAllByRole('cell', { name: 'ok' })).toHaveLength(2)
  })

  it('keeps its input across a remount of the same instance', () => {
    const { unmount } = render(<K8sResourceCalculatorWidget instanceId="test" mode="grid" />)
    setCodeMirrorValue(manifestField(), 'kind: ConfigMap\n')
    unmount()

    render(<K8sResourceCalculatorWidget instanceId="test" mode="grid" />)
    expect(manifestField()).toHaveTextContent('kind: ConfigMap')
  })
})
