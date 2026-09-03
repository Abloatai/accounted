import Ablo from '@abloatai/ablo'
import Sessions from '@abloatai/ablo/sessions'
import type {
  AgentTurnLease,
  TransactionCategorizationClaimInput,
} from '../contract'
import { schema } from './schema'

const CLAIM_TTL = '30s'
const HEARTBEAT_EVERY = '10s'

export class AgentCoordinationUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AgentCoordinationUnavailableError'
  }
}

export function isAgentCoordinationEnabled(): boolean {
  return process.env.ABLO_COORDINATION_ENABLED === 'true'
}

export async function claimTransactionCategorizationWithAblo(
  input: TransactionCategorizationClaimInput,
): Promise<AgentTurnLease | null> {
  const apiKey = process.env.ABLO_API_KEY
  if (!apiKey) {
    throw new AgentCoordinationUnavailableError(
      'ABLO_API_KEY is required when ABLO_COORDINATION_ENABLED=true',
    )
  }

  try {
    const session = await Sessions({ schema, apiKey }).create({
      agent: { id: input.conversationId },
      onBehalfOf: { user: { id: input.userId } },
      can: { transactionCategorizations: ['read', 'update'] },
      ttlSeconds: 360,
      userMeta: { companyId: input.companyId },
    })
    const client = Ablo({
      schema,
      apiKey: session.token,
      transport: 'http',
    })

    try {
      const claim = await client.transactionCategorizations.claim(
        `${input.companyId}:${input.transactionId}`,
        {
          description: 'preparing an Accounted bank transaction categorization',
          contention: { mode: 'skip' },
          ttl: CLAIM_TTL,
          heartbeat: { every: HEARTBEAT_EVERY },
        },
      )
      if (!claim) {
        await client.dispose()
        return null
      }

      return {
        async release() {
          try {
            await claim.release()
          } finally {
            await client.dispose()
          }
        },
      }
    } catch (error) {
      await client.dispose()
      throw error
    }
  } catch (error) {
    if (error instanceof AgentCoordinationUnavailableError) throw error
    throw new AgentCoordinationUnavailableError('Ablo coordination is unavailable', {
      cause: error,
    })
  }
}
