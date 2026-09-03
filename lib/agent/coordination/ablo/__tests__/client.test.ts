import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ablo: vi.fn(),
  sessions: vi.fn(),
  createSession: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  dispose: vi.fn(),
}))

vi.mock('@abloatai/ablo', () => ({ default: mocks.ablo }))
vi.mock('@abloatai/ablo/sessions', () => ({ default: mocks.sessions }))

import {
  AgentCoordinationUnavailableError,
  claimAgentWorkWithAblo,
} from '../client'

const input = {
  targets: [
    {
      scope: 'resource' as const,
      id: 'transaction:transaction-1',
      description: 'categorizing a transaction',
    },
  ],
  participantId: 'conversation-1',
  companyId: 'company-1',
  userId: 'user-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.release.mockResolvedValue(undefined)
  mocks.dispose.mockResolvedValue(undefined)
  mocks.claim.mockResolvedValue({ release: mocks.release })
  mocks.createSession.mockResolvedValue({ token: 'rk_test' })
  mocks.sessions.mockReturnValue({ create: mocks.createSession })
  mocks.ablo.mockReturnValue({
    agentWork: { claim: mocks.claim },
    dispose: mocks.dispose,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('claimAgentWorkWithAblo', () => {
  it('uses the SDK default base URL and a scoped agent session', async () => {
    vi.stubEnv('ABLO_API_KEY', 'sk_test')

    const lease = await claimAgentWorkWithAblo(input)

    expect(mocks.sessions).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk_test' }),
    )
    expect(mocks.sessions.mock.calls[0][0]).not.toHaveProperty('baseURL')
    expect(mocks.createSession).toHaveBeenCalledWith({
      agent: { id: 'conversation-1' },
      onBehalfOf: { user: { id: 'user-1' } },
      can: { agentWork: ['read', 'update'] },
      ttlSeconds: 360,
      userMeta: { companyId: 'company-1' },
    })
    expect(mocks.ablo.mock.calls[0][0]).not.toHaveProperty('baseURL')
    expect(mocks.claim).toHaveBeenCalledWith('company-1:resource:transaction:transaction-1', {
      description: 'categorizing a transaction',
      contention: { mode: 'skip' },
      ttl: '30s',
      heartbeat: { every: '10s' },
    })

    await lease?.release()
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it('fails before creating a client when the project key is missing', async () => {
    vi.stubEnv('ABLO_API_KEY', '')

    await expect(claimAgentWorkWithAblo(input)).rejects.toBeInstanceOf(
      AgentCoordinationUnavailableError,
    )
    expect(mocks.sessions).not.toHaveBeenCalled()
  })

  it('returns null and disposes the client when the claim is contended', async () => {
    vi.stubEnv('ABLO_API_KEY', 'sk_test')
    mocks.claim.mockResolvedValue(null)

    await expect(claimAgentWorkWithAblo(input)).resolves.toBeNull()
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it('releases earlier claims when a later target is contended', async () => {
    vi.stubEnv('ABLO_API_KEY', 'sk_test')
    mocks.claim
      .mockResolvedValueOnce({ release: mocks.release })
      .mockResolvedValueOnce(null)

    await expect(claimAgentWorkWithAblo({
      ...input,
      targets: [
        ...input.targets,
        { scope: 'resource', id: 'invoice:invoice-1', description: 'updating an invoice' },
      ],
    })).resolves.toBeNull()
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it('makes lease release idempotent', async () => {
    vi.stubEnv('ABLO_API_KEY', 'sk_test')

    const lease = await claimAgentWorkWithAblo(input)
    await lease?.release()
    await lease?.release()

    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it('disposes the client when claiming fails', async () => {
    vi.stubEnv('ABLO_API_KEY', 'sk_test')
    mocks.claim.mockRejectedValue(new Error('network down'))

    await expect(claimAgentWorkWithAblo(input)).rejects.toBeInstanceOf(
      AgentCoordinationUnavailableError,
    )
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })
})
