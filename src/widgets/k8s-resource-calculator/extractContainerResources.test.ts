import { describe, expect, it } from 'vitest'
import { extractContainerResources } from './extractContainerResources'

describe('extractContainerResources', () => {
  it('returns empty results for empty input', () => {
    const result = extractContainerResources('')
    expect(result.rows).toEqual([])
    expect(result.totals).toEqual({ cpuRequest: 0, cpuLimit: 0, memoryRequest: 0, memoryLimit: 0 })
    expect(result.errors).toEqual([])
  })

  it('reads containers directly from a bare Pod', () => {
    const yaml = `
apiVersion: v1
kind: Pod
metadata:
  name: web
spec:
  containers:
    - name: app
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 200m
          memory: 256Mi
`
    const result = extractContainerResources(yaml)
    expect(result.rows).toEqual([
      {
        resourceKind: 'Pod',
        resourceName: 'web',
        containerName: 'app',
        kind: 'container',
        cpuRequest: 100,
        cpuLimit: 200,
        memoryRequest: 128 * 2 ** 20,
        memoryLimit: 256 * 2 ** 20,
      },
    ])
  })

  it('reads containers through spec.template.spec for a Deployment', () => {
    const yaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      containers:
        - name: api
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
`
    const result = extractContainerResources(yaml)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ resourceKind: 'Deployment', resourceName: 'api', containerName: 'api' })
  })

  it('reads containers through spec.jobTemplate.spec.template.spec for a CronJob', () => {
    const yaml = `
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly
spec:
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: job
              resources:
                requests:
                  cpu: 50m
`
    const result = extractContainerResources(yaml)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ resourceKind: 'CronJob', resourceName: 'nightly', containerName: 'job' })
  })

  it('sums containers, initContainers, and ephemeralContainers together', () => {
    const yaml = `
apiVersion: v1
kind: Pod
metadata:
  name: full
spec:
  initContainers:
    - name: migrate
      resources:
        requests: { cpu: 100m, memory: 128Mi }
        limits: { cpu: 200m, memory: 256Mi }
  containers:
    - name: app
      resources:
        requests: { cpu: 250m, memory: 256Mi }
        limits: { cpu: 500m, memory: 512Mi }
    - name: sidecar
      resources:
        requests: { cpu: 50m, memory: 64Mi }
        limits: { cpu: 100m, memory: 128Mi }
  ephemeralContainers:
    - name: debug
      resources:
        requests: { cpu: 10m, memory: 16Mi }
`
    const result = extractContainerResources(yaml)
    expect(result.rows).toHaveLength(4)
    expect(result.rows.map((r) => r.kind)).toEqual(['container', 'container', 'initContainer', 'ephemeralContainer'])
    expect(result.totals).toEqual({
      cpuRequest: 250 + 50 + 100 + 10,
      cpuLimit: 500 + 100 + 200,
      memoryRequest: (256 + 64 + 128 + 16) * 2 ** 20,
      memoryLimit: (512 + 128 + 256) * 2 ** 20,
    })
  })

  it('sums across multiple --- separated documents', () => {
    const yaml = `
apiVersion: v1
kind: Pod
metadata:
  name: a
spec:
  containers:
    - name: a
      resources:
        requests: { cpu: 100m }
---
apiVersion: v1
kind: Pod
metadata:
  name: b
spec:
  containers:
    - name: b
      resources:
        requests: { cpu: 200m }
`
    const result = extractContainerResources(yaml)
    expect(result.rows).toHaveLength(2)
    expect(result.totals.cpuRequest).toBe(300)
  })

  it('unwraps a List of resources', () => {
    const yaml = `
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: Pod
    metadata:
      name: a
    spec:
      containers:
        - name: a
          resources:
            requests: { cpu: 100m }
  - apiVersion: v1
    kind: Pod
    metadata:
      name: b
    spec:
      containers:
        - name: b
          resources:
            requests: { cpu: 200m }
`
    const result = extractContainerResources(yaml)
    expect(result.rows).toHaveLength(2)
    expect(result.totals.cpuRequest).toBe(300)
  })

  it('treats a container with no resources block as all-null, contributing 0 to totals', () => {
    const yaml = `
apiVersion: v1
kind: Pod
metadata:
  name: bare
spec:
  containers:
    - name: app
`
    const result = extractContainerResources(yaml)
    expect(result.rows[0]).toMatchObject({
      cpuRequest: null,
      cpuLimit: null,
      memoryRequest: null,
      memoryLimit: null,
    })
    expect(result.totals).toEqual({ cpuRequest: 0, cpuLimit: 0, memoryRequest: 0, memoryLimit: 0 })
  })

  it('falls back to a placeholder name for an unnamed container', () => {
    const yaml = `
apiVersion: v1
kind: Pod
spec:
  containers:
    - resources:
        requests: { cpu: 100m }
`
    const result = extractContainerResources(yaml)
    expect(result.rows[0].containerName).toBe('(container 1)')
    expect(result.rows[0].resourceName).toBeNull()
  })

  it('ignores a resource with no recognizable pod spec, without erroring', () => {
    const yaml = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: config
data:
  key: value
`
    const result = extractContainerResources(yaml)
    expect(result.rows).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('reports a parse error for a malformed document but still processes the others', () => {
    const yaml = `
apiVersion: v1
kind: Pod
metadata:
  name: broken
spec: [unterminated
---
apiVersion: v1
kind: Pod
metadata:
  name: ok
spec:
  containers:
    - name: ok
      resources:
        requests: { cpu: 100m }
`
    const result = extractContainerResources(yaml)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/Document 1/)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].resourceName).toBe('ok')
  })
})
