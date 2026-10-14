/** Pure kubeconfig parsing behind the Kubeconfig Viewer widget — no DOM, no
 * widget state. Reads the handful of fields kubectl actually cares about
 * (clusters, contexts, users, current-context) into a plain summary, and
 * separately builds a credential-free copy of the same file for sharing. */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface KubeconfigCluster {
  name: string
  server: string | null
  insecureSkipTlsVerify: boolean
  hasCertificateAuthority: boolean
}

export interface KubeconfigContext {
  name: string
  cluster: string | null
  user: string | null
  namespace: string | null
  isCurrent: boolean
}

export interface KubeconfigUser {
  name: string
  authMethods: string[]
}

export interface KubeconfigSummary {
  currentContext: string | null
  clusters: KubeconfigCluster[]
  contexts: KubeconfigContext[]
  users: KubeconfigUser[]
  /** Dangling references (a current-context or context that points at a
   * cluster/user that isn't defined) — a kubeconfig assembled by hand or
   * merged from several files can easily end up broken this way without
   * kubectl itself saying so until it's actually used. */
  warnings: string[]
}

export type ParseKubeconfigResult = { ok: true; summary: KubeconfigSummary } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function stringField(entry: unknown, key: string): string | null {
  if (!isRecord(entry)) return null
  const value = entry[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function detectAuthMethods(user: Record<string, unknown>): string[] {
  const methods: string[] = []
  if (user['client-certificate-data'] || user['client-certificate']) methods.push('Client certificate')
  if (user.token || user.tokenFile) methods.push('Bearer token')
  if (user.username || user.password) methods.push('Basic auth')
  if (isRecord(user.exec)) {
    const command = stringField(user.exec, 'command')
    methods.push(command ? `Exec (${command})` : 'Exec plugin')
  }
  if (isRecord(user['auth-provider'])) {
    const name = stringField(user['auth-provider'], 'name')
    methods.push(name ? `Auth provider (${name})` : 'Auth provider')
  }
  return methods.length > 0 ? methods : ['None detected']
}

export function parseKubeconfig(text: string): ParseKubeconfigResult {
  if (!text.trim()) return { ok: false, error: 'Paste a kubeconfig to see it summarized here.' }

  let doc: unknown
  try {
    doc = parseYaml(text)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not parse this as YAML.' }
  }

  if (!isRecord(doc)) {
    return { ok: false, error: 'This does not look like a kubeconfig: expected a YAML mapping at the top level.' }
  }

  const rawClusters = asRecordArray(doc.clusters)
  const rawContexts = asRecordArray(doc.contexts)
  const rawUsers = asRecordArray(doc.users)

  if (rawClusters.length === 0 && rawContexts.length === 0 && rawUsers.length === 0) {
    return { ok: false, error: 'No clusters, contexts, or users found — is this a kubeconfig file?' }
  }

  const currentContext = stringField(doc, 'current-context')

  const clusters: KubeconfigCluster[] = rawClusters.map((entry) => {
    const cluster = isRecord(entry.cluster) ? entry.cluster : {}
    return {
      name: stringField(entry, 'name') ?? '(unnamed)',
      server: stringField(cluster, 'server'),
      insecureSkipTlsVerify: cluster['insecure-skip-tls-verify'] === true,
      hasCertificateAuthority: Boolean(cluster['certificate-authority-data'] || cluster['certificate-authority']),
    }
  })

  const users: KubeconfigUser[] = rawUsers.map((entry) => ({
    name: stringField(entry, 'name') ?? '(unnamed)',
    authMethods: detectAuthMethods(isRecord(entry.user) ? entry.user : {}),
  }))

  const contexts: KubeconfigContext[] = rawContexts.map((entry) => {
    const context = isRecord(entry.context) ? entry.context : {}
    const name = stringField(entry, 'name') ?? '(unnamed)'
    return {
      name,
      cluster: stringField(context, 'cluster'),
      user: stringField(context, 'user'),
      namespace: stringField(context, 'namespace'),
      isCurrent: currentContext !== null && name === currentContext,
    }
  })

  const clusterNames = new Set(clusters.map((c) => c.name))
  const userNames = new Set(users.map((u) => u.name))
  const contextNames = new Set(contexts.map((c) => c.name))

  const warnings: string[] = []
  if (currentContext && !contextNames.has(currentContext)) {
    warnings.push(`current-context "${currentContext}" does not match any defined context.`)
  }
  for (const context of contexts) {
    if (context.cluster && !clusterNames.has(context.cluster)) {
      warnings.push(`Context "${context.name}" references undefined cluster "${context.cluster}".`)
    }
    if (context.user && !userNames.has(context.user)) {
      warnings.push(`Context "${context.name}" references undefined user "${context.user}".`)
    }
  }

  return { ok: true, summary: { currentContext, clusters, contexts, users, warnings } }
}

// Field names that hold raw credential material anywhere they appear in a
// kubeconfig (cluster CA data, client certs/keys, bearer tokens, basic-auth
// password, and the OIDC token fields auth-provider configs commonly carry).
const SENSITIVE_KEYS = new Set([
  'client-certificate-data',
  'client-key-data',
  'certificate-authority-data',
  'token',
  'tokenFile',
  'password',
  'id-token',
  'access-token',
  'refresh-token',
  'client-secret',
])

const REDACTED = 'REDACTED'

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue)
  if (!isRecord(value)) return value

  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = REDACTED
    } else if (key === 'env' && Array.isArray(val)) {
      // exec.env entries can carry secrets (an API key passed to a login
      // plugin) in `value` — keep the variable name visible, drop the value.
      result[key] = val.map((entry) => (isRecord(entry) && 'value' in entry ? { ...entry, value: REDACTED } : entry))
    } else {
      result[key] = redactValue(val)
    }
  }
  return result
}

export type RedactKubeconfigResult = { ok: true; yaml: string } | { ok: false; error: string }

/** Rebuilds the kubeconfig with every credential field replaced by a fixed
 * placeholder, safe to paste into a bug report or chat without leaking
 * access to the cluster. Re-serializing through the YAML library means
 * comments and key ordering aren't preserved — only the structure and
 * non-sensitive values are. */
export function redactKubeconfig(text: string): RedactKubeconfigResult {
  let doc: unknown
  try {
    doc = parseYaml(text)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not parse this as YAML.' }
  }
  if (!isRecord(doc)) return { ok: false, error: 'This does not look like a kubeconfig.' }
  return { ok: true, yaml: stringifyYaml(redactValue(doc)) }
}
