/** Pure Kubernetes manifest walking behind the Resource Calculator widget —
 * no DOM, no widget state. Finds every container (regular, init, and
 * ephemeral) across one or more pasted manifests and totals their declared
 * CPU/memory requests and limits. */

import { parseAllDocuments } from 'yaml'
import { parseCpuQuantity, parseMemoryQuantity } from './k8sQuantity'

export type ContainerKind = 'container' | 'initContainer' | 'ephemeralContainer'

export interface ContainerResourceRow {
  /** The owning resource's `kind` (Pod, Deployment, CronJob, …), or null if
   * the manifest didn't have one. */
  resourceKind: string | null
  /** The owning resource's `metadata.name`, or null if unnamed. */
  resourceName: string | null
  containerName: string
  kind: ContainerKind
  /** All four in a fixed base unit (millicores, bytes) so they can be
   * summed directly — null means the manifest didn't set that field. */
  cpuRequest: number | null
  cpuLimit: number | null
  memoryRequest: number | null
  memoryLimit: number | null
}

export interface ResourceTotals {
  cpuRequest: number
  cpuLimit: number
  memoryRequest: number
  memoryLimit: number
}

export interface ExtractResourcesResult {
  rows: ContainerResourceRow[]
  totals: ResourceTotals
  /** YAML parse errors, one per malformed document — parsing still
   * continues for the other documents in a multi-document paste. */
  errors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = obj[key]
  return isRecord(value) ? value : null
}

function stringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Finds the Pod spec inside one Kubernetes resource, trying the shapes
 * actually seen in practice, falling back through them in order: a bare
 * Pod (`spec` directly has `containers`), a workload controller
 * (`spec.template.spec` — Deployment, StatefulSet, DaemonSet, ReplicaSet,
 * Job), and a CronJob (`spec.jobTemplate.spec.template.spec`). */
function findPodSpec(resource: Record<string, unknown>): Record<string, unknown> | null {
  const spec = getRecord(resource, 'spec')
  if (!spec) return null
  if (Array.isArray(spec.containers)) return spec

  const template = getRecord(spec, 'template')
  const templateSpec = template ? getRecord(template, 'spec') : null
  if (templateSpec && Array.isArray(templateSpec.containers)) return templateSpec

  const jobTemplate = getRecord(spec, 'jobTemplate')
  const jobTemplateSpec = jobTemplate ? getRecord(jobTemplate, 'spec') : null
  const cronTemplate = jobTemplateSpec ? getRecord(jobTemplateSpec, 'template') : null
  const cronPodSpec = cronTemplate ? getRecord(cronTemplate, 'spec') : null
  if (cronPodSpec && Array.isArray(cronPodSpec.containers)) return cronPodSpec

  return null
}

/** A List-shaped object (`kind: List`/`PodList`/…, or the raw output of
 * `kubectl get ... -o yaml` for multiple objects) wraps its real resources
 * in `items`. One level of unwrapping covers every form actually seen. */
function collectResources(doc: unknown): Record<string, unknown>[] {
  if (!isRecord(doc)) return []
  if (Array.isArray(doc.items)) return doc.items.filter(isRecord)
  return [doc]
}

const CONTAINER_FIELDS: { field: string; kind: ContainerKind }[] = [
  { field: 'containers', kind: 'container' },
  { field: 'initContainers', kind: 'initContainer' },
  { field: 'ephemeralContainers', kind: 'ephemeralContainer' },
]

function extractQuantities(container: Record<string, unknown>) {
  const resources = getRecord(container, 'resources')
  const requests = resources ? getRecord(resources, 'requests') : null
  const limits = resources ? getRecord(resources, 'limits') : null
  return {
    cpuRequest: requests ? parseCpuQuantity(requests.cpu) : null,
    cpuLimit: limits ? parseCpuQuantity(limits.cpu) : null,
    memoryRequest: requests ? parseMemoryQuantity(requests.memory) : null,
    memoryLimit: limits ? parseMemoryQuantity(limits.memory) : null,
  }
}

function zeroTotals(): ResourceTotals {
  return { cpuRequest: 0, cpuLimit: 0, memoryRequest: 0, memoryLimit: 0 }
}

function sumTotals(rows: ContainerResourceRow[]): ResourceTotals {
  const totals = zeroTotals()
  for (const row of rows) {
    totals.cpuRequest += row.cpuRequest ?? 0
    totals.cpuLimit += row.cpuLimit ?? 0
    totals.memoryRequest += row.memoryRequest ?? 0
    totals.memoryLimit += row.memoryLimit ?? 0
  }
  return totals
}

/** Walks one or more `---`-separated Kubernetes manifests and totals the
 * CPU/memory requests and limits declared across every container,
 * initContainer, and ephemeralContainer found — in a bare Pod, a workload
 * controller, a CronJob, or a List of any of those. */
export function extractContainerResources(manifestText: string): ExtractResourcesResult {
  if (!manifestText.trim()) return { rows: [], totals: zeroTotals(), errors: [] }

  const errors: string[] = []
  const resources: Record<string, unknown>[] = []

  parseAllDocuments(manifestText).forEach((document, index) => {
    if (document.errors.length > 0) {
      errors.push(`Document ${index + 1}: ${document.errors[0].message}`)
      return
    }
    resources.push(...collectResources(document.toJS()))
  })

  const rows: ContainerResourceRow[] = []
  for (const resource of resources) {
    const podSpec = findPodSpec(resource)
    if (!podSpec) continue

    const metadata = getRecord(resource, 'metadata')
    const resourceKind = stringField(resource, 'kind')
    const resourceName = metadata ? stringField(metadata, 'name') : null

    for (const { field, kind } of CONTAINER_FIELDS) {
      const containers = podSpec[field]
      if (!Array.isArray(containers)) continue
      containers.forEach((container, containerIndex) => {
        if (!isRecord(container)) return
        rows.push({
          resourceKind,
          resourceName,
          containerName: stringField(container, 'name') ?? `(container ${containerIndex + 1})`,
          kind,
          ...extractQuantities(container),
        })
      })
    }
  }

  return { rows, totals: sumTotals(rows), errors }
}
