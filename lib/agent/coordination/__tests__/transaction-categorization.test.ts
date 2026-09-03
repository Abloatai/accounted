import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  coordinateAgentTurn,
  transactionIdForTurn,
} from '../transaction-categorization'
import type { AgentCoordinationDependencies } from '../contract'

const input = {
  intentId: 'transaction.categorization',
  intentArgs: { transaction_id: 'transaction-1' },
  contextRef: 'transaction:transaction-from-context',
  conversationId: 'conversation-1',
  companyId: 'company-1',
  userId: 'user-1',
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('transactionIdForTurn', () => {
  it('prefers the explicit intent argument', () => {
    expect(transactionIdForTurn(input)).toBe('transaction-1')
  })

  it('uses the stored context when a conversation is resumed', () => {
    expect(
      transactionIdForTurn({ ...input, intentArgs: null }),
    ).toBe('transaction-from-context')
  })

  it('does not coordinate unrelated intents', () => {
    expect(transactionIdForTurn({ ...input, intentId: 'onboarding.intake' })).toBeNull()
  })
})

describe('coordinateAgentTurn', () => {
  it('does not contact Ablo when coordination is disabled', async () => {
    vi.stubEnv('ABLO_COORDINATION_ENABLED', 'false')
    const dependencies = dependenciesWithClaim(vi.fn())

    await expect(coordinateAgentTurn(input, dependencies)).resolves.toEqual({
      outcome: 'disabled',
    })
    expect(dependencies.claimTransactionCategorization).not.toHaveBeenCalled()
  })

  it('returns a held lease after acquiring the transaction claim', async () => {
    vi.stubEnv('ABLO_COORDINATION_ENABLED', 'true')
    const lease = { release: vi.fn(async () => undefined) }
    const dependencies = dependenciesWithClaim(vi.fn(async () => lease))

    await expect(coordinateAgentTurn(input, dependencies)).resolves.toEqual({
      outcome: 'acquired',
      lease,
    })
    expect(dependencies.claimTransactionCategorization).toHaveBeenCalledWith({
      transactionId: 'transaction-1',
      conversationId: 'conversation-1',
      companyId: 'company-1',
      userId: 'user-1',
    })
  })

  it('reports contention without starting duplicate work', async () => {
    vi.stubEnv('ABLO_COORDINATION_ENABLED', 'true')
    const dependencies = dependenciesWithClaim(vi.fn(async () => null))

    await expect(coordinateAgentTurn(input, dependencies)).resolves.toEqual({
      outcome: 'contended',
    })
  })
})

function dependenciesWithClaim(
  claim: AgentCoordinationDependencies['claimTransactionCategorization'],
): AgentCoordinationDependencies {
  return { claimTransactionCategorization: claim }
}
