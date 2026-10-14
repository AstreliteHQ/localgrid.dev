import { useMemo, type ReactNode } from 'react'
import { Check, Server, TriangleAlert } from 'lucide-react'
import { CodeEditor } from '@/components/CodeEditor'
import { CopyButton } from '@/components/CopyButton'
import { ErrorMessage } from '@/components/ErrorMessage'
import { cn } from '@/lib/utils'
import { useWidgetDirty } from '@/widgets/useWidgetDirty'
import { useWidgetState } from '@/widgets/useWidgetState'
import type { WidgetProps } from '@/widgets/types'
import { parseKubeconfig, redactKubeconfig, type KubeconfigSummary } from './parseKubeconfig'

const DEFAULT_INPUT = ''

export default function KubeconfigViewerWidget({ instanceId }: WidgetProps) {
  const [input, setInput] = useWidgetState(instanceId, 'input', DEFAULT_INPUT)
  useWidgetDirty(instanceId, input !== DEFAULT_INPUT)

  const result = useMemo(() => parseKubeconfig(input), [input])
  const redacted = useMemo(() => (result.ok ? redactKubeconfig(input) : null), [input, result.ok])

  return (
    <div className="flex h-full flex-col gap-2 text-xs">
      <CodeEditor
        value={input}
        onChange={setInput}
        language="plaintext"
        placeholder="Paste a kubeconfig (YAML) or drop the file…"
        aria-label="Kubeconfig input"
        className="min-h-20 flex-1"
      />
      <div className="min-h-0 flex-[2] overflow-auto">
        {!input.trim() ? (
          <p className="flex h-full items-center justify-center gap-1.5 text-center text-muted-foreground">
            <Server className="size-3.5 shrink-0" aria-hidden="true" />
            Paste a kubeconfig to see its contexts, clusters, and users
          </p>
        ) : !result.ok ? (
          <ErrorMessage>{result.error}</ErrorMessage>
        ) : (
          <KubeconfigSummaryView summary={result.summary} redactedYaml={redacted?.ok ? redacted.yaml : null} />
        )}
      </div>
    </div>
  )
}

function KubeconfigSummaryView({ summary, redactedYaml }: { summary: KubeconfigSummary; redactedYaml: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn(
            'flex w-fit items-center gap-1 rounded px-1.5 py-0.5 font-medium',
            summary.currentContext ? 'bg-success/15 text-success dark:bg-success/20' : 'bg-muted text-muted-foreground',
          )}
        >
          <Check className="size-3.5" aria-hidden="true" />
          {summary.currentContext ? `Current context: ${summary.currentContext}` : 'No current-context set'}
        </p>
        {redactedYaml && (
          <CopyButton
            value={redactedYaml}
            label="Copy sanitized kubeconfig"
            ariaLabel="Copy sanitized kubeconfig"
            className="shrink-0"
          />
        )}
      </div>

      {summary.warnings.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Kubeconfig issues">
          {summary.warnings.map((warning, index) => (
            <li key={`${index}:${warning}`} className="flex items-start gap-1.5 text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {warning}
            </li>
          ))}
        </ul>
      )}

      <Section title={`Contexts (${summary.contexts.length})`}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Cluster</Th>
              <Th>User</Th>
              <Th>Namespace</Th>
            </tr>
          </thead>
          <tbody>
            {summary.contexts.map((context, index) => (
              <tr
                key={`${index}:${context.name}`}
                className={cn('odd:bg-muted/20', context.isCurrent && 'bg-success/10')}
              >
                <Td>
                  <span className="flex items-center gap-1.5">
                    {context.name}
                    {context.isCurrent && (
                      <span className="rounded bg-success/15 px-1 py-0.5 text-[10px] font-medium text-success">
                        current
                      </span>
                    )}
                  </span>
                </Td>
                <Td>{context.cluster ?? '—'}</Td>
                <Td>{context.user ?? '—'}</Td>
                <Td>{context.namespace ?? 'default'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Clusters (${summary.clusters.length})`}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Server</Th>
              <Th>TLS</Th>
            </tr>
          </thead>
          <tbody>
            {summary.clusters.map((cluster, index) => (
              <tr key={`${index}:${cluster.name}`} className="odd:bg-muted/20">
                <Td>{cluster.name}</Td>
                <Td className="break-all whitespace-normal">{cluster.server ?? '—'}</Td>
                <Td>
                  {cluster.insecureSkipTlsVerify ? (
                    <span className="flex items-center gap-1 text-destructive">
                      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                      Insecure (skip verify)
                    </span>
                  ) : cluster.hasCertificateAuthority ? (
                    <span className="text-muted-foreground">CA pinned</span>
                  ) : (
                    <span className="text-muted-foreground">System CA</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Users (${summary.users.length})`}>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Auth</Th>
            </tr>
          </thead>
          <tbody>
            {summary.users.map((user, index) => (
              <tr key={`${index}:${user.name}`} className="odd:bg-muted/20">
                <Td>{user.name}</Td>
                <Td className="whitespace-normal">{user.authMethods.join(', ')}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <div className="overflow-auto rounded-md border border-border">{children}</div>
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
