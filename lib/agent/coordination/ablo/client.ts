import Ablo from '@abloatai/ablo'
import Sessions from '@abloatai/ablo/sessions'
import type {
  AgentWorkClaimInput,
  AgentTurnLease,
} from '../contract'
import { schema } from './schema'

const CLAIM_TTL = '30s'
const HEARTBEAT_EVERY = '10s'

export class AgentCoordinationUnavailableError extends Error {
  readonly code = 'TRANSIENT_ERROR'

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AgentCoordinationUnavailableError'
  }
}

export function isAgentCoordinationEnabled(): boolean {
  return process.env.ABLO_COORDINATION_ENABLED === 'true'
}

export async function claimAgentWorkWithAblo(
  input: AgentWorkClaimInput,
): Promise<AgentTurnLease | null> {
  const apiKey = process.env.ABLO_API_KEY
  if (!apiKey) {
    throw new AgentCoordinationUnavailableError(
      'ABLO_API_KEY is required when ABLO_COORDINATION_ENABLED=true',
    )
  }

  try {
    const session = await Sessions({ schema, apiKey }).create({
      agent: { id: input.participantId },
      onBehalfOf: { user: { id: input.userId } },
      can: { agentWork: ['read', 'update'] },
      ttlSeconds: 360,
      userMeta: { companyId: input.companyId },
    })
    const client = Ablo({
      schema,
      apiKey: session.token,
      transport: 'http',
    })

    const claims: Array<{ release(): Promise<void> }> = []
    let closed = false
    const close = async () => {
      if (closed) return
      closed = true
      try {
        await releaseClaims(claims)
      } finally {
        await client.dispose()
      }
    }
    try {
      for (const target of input.targets) {
        const claim = await client.agentWork.claim(
          `${input.companyId}:${target.scope}:${target.id}`,
          {
            description: target.description,
            contention: { mode: 'skip' },
            ttl: CLAIM_TTL,
            heartbeat: { every: HEARTBEAT_EVERY },
          },
        )
        if (!claim) {
          await close()
          return null
        }
        claims.push(claim)
      }

      return {
        async release() {
          await close()
        },
      }
    } catch (error) {
      await close()
      throw error
    }
  } catch (error) {
    if (error instanceof AgentCoordinationUnavailableError) throw error
    throw new AgentCoordinationUnavailableError('Ablo coordination is unavailable', {
      cause: error,
    })
  }
}

async function releaseClaims(claims: ReadonlyArray<{ release(): Promise<void> }>): Promise<void> {
  let firstError: unknown
  for (const claim of claims.slice().reverse()) {
    try {
      await claim.release()
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError) throw firstError
}
