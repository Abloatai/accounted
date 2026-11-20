import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  coordinateAgentTurn,
  resourceIdForTurn,
  resourceIdForContext,
  transactionIdForTurn,
} from '../agent-turn'
import type { AgentCoordinationDependencies } from '../contract'

const input = {
  intentId: 'transaction.categorization',
  intentArgs: { transaction_id: 'transaction-1' },
  contextRef: 'transaction:11111111-1111-4111-8111-111111111111',
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
    ).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('does not coordinate unrelated intents', () => {
    expect(transactionIdForTurn({ ...input, intentId: 'onboarding.intake' })).toBeNull()
  })
})

describe('resourceIdForTurn', () => {
  it('uses a concrete persisted record reference', () => {
    expect(resourceIdForTurn({ ...input, intentId: 'invoice.draft' })).toBe(
      'transaction:11111111-1111-4111-8111-111111111111',
    )
  })

  it('derives entity resources when no context reference was supplied', () => {
    expect(
      resourceIdForTurn({
        intentId: 'supplier_invoice.review',
        intentArgs: { supplier_invoice_id: 'supplier-invoice-1' },
        contextRef: null,
      }),
    ).toBe('supplier_invoice:supplier-invoice-1')
  })
})

describe('resourceIdForContext', () => {
  it.each(['kpi:översikt', 'bokslut:overview', 'verifikation:new', 'inbox:bulk', 'report:vat:2026-07', 'transaction:new'])('does not claim the page label %s', (contextRef) => {
    expect(resourceIdForContext(contextRef)).toBeNull()
    expect(resourceIdForTurn({ intentId: 'onboarding.intake', intentArgs: null, contextRef })).toBeNull()
  })
})

describe('coordinateAgentTurn', () => {
  it('does not contact Ablo when coordination is disabled', async () => {
    vi.stubEnv('ABLO_COORDINATION_ENABLED', 'false')
    const dependencies = dependenciesWithClaim(vi.fn())

    await expect(coordinateAgentTurn(input, dependencies)).resolves.toEqual({
      outcome: 'disabled',
    })
    expect(dependencies.claimAgentWork).not.toHaveBeenCalled()
  })

  it('returns a held lease after acquiring the transaction claim', async () => {
    vi.stubEnv('ABLO_COORDINATION_ENABLED', 'true')
    const lease = { release: vi.fn(async () => undefined) }
    const dependencies = dependenciesWithClaim(vi.fn(async () => lease))

    await expect(coordinateAgentTurn(input, dependencies)).resolves.toEqual({
      outcome: 'acquired',
      lease,
    })
    expect(dependencies.claimAgentWork).toHaveBeenCalledWith({
      targets: [
        {
          scope: 'conversation',
          id: 'conversation-1',
          description: 'running Accounted agent conversation conversation-1',
        },
        {
          scope: 'resource',
          id: 'transaction:11111111-1111-4111-8111-111111111111',
          description: 'working on Accounted resource transaction:11111111-1111-4111-8111-111111111111',
        },
      ],
      participantId: expect.any(String),
      companyId: 'company-1',
      userId: 'user-1',
    })
  })

  it('gives overlapping requests distinct participants for the same conversation', async () => {
    vi.stubEnv('ABLO_COORDINATION_ENABLED', 'true')
    const participants = new Set<string>()
    const lease = { release: vi.fn(async () => undefined) }
    const dependencies = dependenciesWithClaim(vi.fn(async ({ participantId }) => {
      if (participants.size && !participants.has(participantId)) return null
      participants.add(participantId)
      return lease
    }))
    const results = await Promise.all([coordinateAgentTurn(input, dependencies), coordinateAgentTurn(input, dependencies)])
    expect(results.map(result => result.outcome)).toEqual(['acquired', 'contended'])
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
  claim: AgentCoordinationDependencies['claimAgentWork'],
): AgentCoordinationDependencies {
  return { claimAgentWork: claim }
}
