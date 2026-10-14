import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { parseKubeconfig, redactKubeconfig } from './parseKubeconfig'

const SAMPLE = `
apiVersion: v1
kind: Config
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

describe('parseKubeconfig', () => {
  it('reports an error for empty input', () => {
    const result = parseKubeconfig('')
    expect(result.ok).toBe(false)
  })

  it('reports an error for YAML that is not a mapping', () => {
    const result = parseKubeconfig('- just\n- a\n- list')
    expect(result.ok).toBe(false)
  })

  it('reports an error for invalid YAML', () => {
    const result = parseKubeconfig('clusters: [unterminated')
    expect(result.ok).toBe(false)
  })

  it('reports an error when nothing kubeconfig-shaped is found', () => {
    const result = parseKubeconfig('foo: bar\nbaz: 1\n')
    expect(result.ok).toBe(false)
  })

  it('parses clusters, contexts, and users, marking the current context', () => {
    const result = parseKubeconfig(SAMPLE)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.summary.currentContext).toBe('dev')
    expect(result.summary.clusters).toEqual([
      {
        name: 'dev-cluster',
        server: 'https://10.0.0.1:6443',
        insecureSkipTlsVerify: false,
        hasCertificateAuthority: true,
      },
    ])
    expect(result.summary.contexts).toEqual([
      { name: 'dev', cluster: 'dev-cluster', user: 'dev-user', namespace: 'default', isCurrent: true },
    ])
    expect(result.summary.users).toEqual([{ name: 'dev-user', authMethods: ['Client certificate'] }])
    expect(result.summary.warnings).toEqual([])
  })

  it('flags insecure-skip-tls-verify clusters', () => {
    const yaml = `
clusters:
  - name: dev
    cluster:
      server: https://10.0.0.1:6443
      insecure-skip-tls-verify: true
`
    const result = parseKubeconfig(yaml)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.clusters[0].insecureSkipTlsVerify).toBe(true)
  })

  it('detects a bearer token auth method', () => {
    const yaml = `
users:
  - name: ci
    user:
      token: abc123
`
    const result = parseKubeconfig(yaml)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.users[0].authMethods).toEqual(['Bearer token'])
  })

  it('detects basic auth, exec, and auth-provider methods', () => {
    const yaml = `
users:
  - name: basic
    user:
      username: admin
      password: secret
  - name: exec-user
    user:
      exec:
        command: aws
  - name: oidc-user
    user:
      auth-provider:
        name: oidc
`
    const result = parseKubeconfig(yaml)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.users).toEqual([
      { name: 'basic', authMethods: ['Basic auth'] },
      { name: 'exec-user', authMethods: ['Exec (aws)'] },
      { name: 'oidc-user', authMethods: ['Auth provider (oidc)'] },
    ])
  })

  it('reports "None detected" for a user with no recognized credentials', () => {
    const yaml = `
users:
  - name: mystery
    user: {}
`
    const result = parseKubeconfig(yaml)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.users[0].authMethods).toEqual(['None detected'])
  })

  it('combines multiple auth methods on one user', () => {
    const yaml = `
users:
  - name: both
    user:
      token: abc
      client-certificate-data: ZmFrZQ==
`
    const result = parseKubeconfig(yaml)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.users[0].authMethods).toEqual(['Client certificate', 'Bearer token'])
  })

  it('warns when current-context does not match any defined context', () => {
    const yaml = `
current-context: missing
contexts:
  - name: dev
    context: {}
`
    const result = parseKubeconfig(yaml)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.warnings).toContain('current-context "missing" does not match any defined context.')
  })

  it('warns when a context references an undefined cluster or user', () => {
    const yaml = `
contexts:
  - name: dev
    context:
      cluster: ghost-cluster
      user: ghost-user
`
    const result = parseKubeconfig(yaml)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.warnings).toContain('Context "dev" references undefined cluster "ghost-cluster".')
    expect(result.summary.warnings).toContain('Context "dev" references undefined user "ghost-user".')
  })

  it('defaults namespace to null when not set, rather than assuming "default"', () => {
    const yaml = `
contexts:
  - name: dev
    context:
      cluster: c
      user: u
`
    const result = parseKubeconfig(yaml)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.summary.contexts[0].namespace).toBeNull()
  })
})

describe('redactKubeconfig', () => {
  it('replaces credential fields with a fixed placeholder', () => {
    const result = redactKubeconfig(SAMPLE)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = parseYaml(result.yaml)
    expect(parsed.clusters[0].cluster['certificate-authority-data']).toBe('REDACTED')
    expect(parsed.users[0].user['client-certificate-data']).toBe('REDACTED')
    expect(parsed.users[0].user['client-key-data']).toBe('REDACTED')
  })

  it('leaves non-sensitive fields (names, server URLs, namespaces) untouched', () => {
    const result = redactKubeconfig(SAMPLE)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = parseYaml(result.yaml)
    expect(parsed.clusters[0].name).toBe('dev-cluster')
    expect(parsed.clusters[0].cluster.server).toBe('https://10.0.0.1:6443')
    expect(parsed.contexts[0].context.namespace).toBe('default')
  })

  it('redacts a bearer token and a basic-auth password', () => {
    const yaml = `
users:
  - name: a
    user:
      token: secret-token
  - name: b
    user:
      username: admin
      password: secret-password
`
    const result = redactKubeconfig(yaml)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = parseYaml(result.yaml)
    expect(parsed.users[0].user.token).toBe('REDACTED')
    expect(parsed.users[1].user.username).toBe('admin')
    expect(parsed.users[1].user.password).toBe('REDACTED')
  })

  it('redacts exec plugin env values while keeping the variable name visible', () => {
    const yaml = `
users:
  - name: exec-user
    user:
      exec:
        command: aws
        env:
          - name: AWS_PROFILE
            value: my-secret-profile-token
`
    const result = redactKubeconfig(yaml)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const parsed = parseYaml(result.yaml)
    const env = parsed.users[0].user.exec.env[0]
    expect(env.name).toBe('AWS_PROFILE')
    expect(env.value).toBe('REDACTED')
  })

  it('reports an error for invalid YAML', () => {
    const result = redactKubeconfig('clusters: [unterminated')
    expect(result.ok).toBe(false)
  })

  it('reports an error for YAML that is not a mapping', () => {
    const result = redactKubeconfig('- just\n- a\n- list')
    expect(result.ok).toBe(false)
  })
})
