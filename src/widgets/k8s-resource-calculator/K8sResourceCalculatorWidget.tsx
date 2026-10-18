import { useMemo, type ReactNode } from 'react'
import { Cpu } from 'lucide-react'
import { CodeEditor } from '@/components/CodeEditor'
import { ErrorMessage } from '@/components/ErrorMessage'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { extractContainerResources, type ContainerResourceRow, type ResourceTotals } from './extractContainerResources'
import { formatCpuMillicores, formatMemoryBytes } from './k8sQuantity'

const DEFAULT_MANIFEST = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      initContainers:
        - name: migrate
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits: { cpu: 200m, memory: 256Mi }
      containers:
        - name: api
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits: { cpu: 500m, memory: 512Mi }
        - name: sidecar
          resources:
            requests: { cpu: 50m, memory: 64Mi }
            limits: { cpu: 100m, memory: 128Mi }
`

const KIND_LABELS: Record<ContainerResourceRow['kind'], string> = {
  container: 'Container',
  initContainer: 'Init container',
  ephemeralContainer: 'Ephemeral container',
}

export default function K8sResourceCalculatorWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'input', DEFAULT_MANIFEST)
  useWidgetDirty(instanceId, input !== DEFAULT_MANIFEST)

  const result = useMemo(() => extractContainerResources(input), [input])
  const hasInput = input.trim().length > 0

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <CodeEditor
        value={input}
        onChange={setInput}
        language="plaintext"
        placeholder="Paste one or more Kubernetes manifests (YAML)…"
        aria-label="Kubernetes manifest input"
        className="min-h-20 flex-1"
      />
      <div className="min-h-0 flex-[2] overflow-auto">
        {!hasInput ? (
          <p className="flex h-full items-center justify-center gap-1.5 text-center text-muted-foreground">
            <Cpu className="size-3.5 shrink-0" aria-hidden="true" />
            Paste a manifest to total its containers' resource requests and limits
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {result.errors.length > 0 && (
              <ul className="flex flex-col gap-1" aria-label="Parse errors">
                {result.errors.map((error) => (
                  <li key={error}>
                    <ErrorMessage>{error}</ErrorMessage>
                  </li>
                ))}
              </ul>
            )}

            {result.rows.length === 0 ? (
              <p className="text-muted-foreground">
                No containers found — paste a Pod, Deployment, StatefulSet, DaemonSet, Job, or CronJob manifest.
              </p>
            ) : (
              <>
                <TotalsSummary totals={result.totals} />
                <ContainerTable rows={result.rows} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TotalsSummary({ totals }: { totals: ResourceTotals }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatTile label="CPU requests" value={formatCpuMillicores(totals.cpuRequest)} />
      <StatTile label="CPU limits" value={formatCpuMillicores(totals.cpuLimit)} />
      <StatTile label="Memory requests" value={formatMemoryBytes(totals.memoryRequest)} />
      <StatTile label="Memory limits" value={formatMemoryBytes(totals.memoryLimit)} />
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold text-foreground">{value}</span>
    </div>
  )
}

function ContainerTable({ rows }: { rows: ContainerResourceRow[] }) {
  return (
    <div className="overflow-auto rounded-md border border-border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <Th>Resource</Th>
            <Th>Container</Th>
            <Th>Type</Th>
            <Th>CPU req</Th>
            <Th>CPU limit</Th>
            <Th>Mem req</Th>
            <Th>Mem limit</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="odd:bg-muted/20">
              <Td>{row.resourceName ?? row.resourceKind ?? '—'}</Td>
              <Td>{row.containerName}</Td>
              <Td>{KIND_LABELS[row.kind]}</Td>
              <Td>{row.cpuRequest === null ? '—' : formatCpuMillicores(row.cpuRequest)}</Td>
              <Td>{row.cpuLimit === null ? '—' : formatCpuMillicores(row.cpuLimit)}</Td>
              <Td>{row.memoryRequest === null ? '—' : formatMemoryBytes(row.memoryRequest)}</Td>
              <Td>{row.memoryLimit === null ? '—' : formatMemoryBytes(row.memoryLimit)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="sticky top-0 whitespace-nowrap border-b border-border bg-muted/70 px-2 py-1 font-medium text-foreground backdrop-blur-sm">
      {children}
    </th>
  )
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('whitespace-nowrap border-b border-border px-2 py-1', className)}>{children}</td>
}
