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
  claimTransactionCategorizationWithAblo,
} from '../client'

const input = {
  transactionId: 'transaction-1',
  conversationId: 'conversation-1',
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
    transactionCategorizations: { claim: mocks.claim },
    dispose: mocks.dispose,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('claimTransactionCategorizationWithAblo', () => {
  it('uses the SDK default base URL and a scoped agent session', async () => {
    vi.stubEnv('ABLO_API_KEY', 'sk_test')

    const lease = await claimTransactionCategorizationWithAblo(input)

    expect(mocks.sessions).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk_test' }),
    )
    expect(mocks.sessions.mock.calls[0][0]).not.toHaveProperty('baseURL')
    expect(mocks.createSession).toHaveBeenCalledWith({
      agent: { id: 'conversation-1' },
      onBehalfOf: { user: { id: 'user-1' } },
      can: { transactionCategorizations: ['read', 'update'] },
      ttlSeconds: 360,
      userMeta: { companyId: 'company-1' },
    })
    expect(mocks.ablo.mock.calls[0][0]).not.toHaveProperty('baseURL')
    expect(mocks.claim).toHaveBeenCalledWith('company-1:transaction-1', {
      description: 'preparing an Accounted bank transaction categorization',
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

    await expect(claimTransactionCategorizationWithAblo(input)).rejects.toBeInstanceOf(
      AgentCoordinationUnavailableError,
    )
    expect(mocks.sessions).not.toHaveBeenCalled()
  })

  it('returns null and disposes the client when the claim is contended', async () => {
    vi.stubEnv('ABLO_API_KEY', 'sk_test')
    mocks.claim.mockResolvedValue(null)

    await expect(claimTransactionCategorizationWithAblo(input)).resolves.toBeNull()
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })
})
