import type {
  AgentCoordinationDependencies,
  AgentTurnCoordination,
  AgentTurnCoordinationInput,
} from './contract'
import {
  claimTransactionCategorizationWithAblo,
  isAgentCoordinationEnabled,
} from './ablo/client'

const TRANSACTION_CATEGORIZATION_INTENT = 'transaction.categorization'
const TRANSACTION_CONTEXT_PREFIX = 'transaction:'

const defaultDependencies: AgentCoordinationDependencies = {
  claimTransactionCategorization: claimTransactionCategorizationWithAblo,
}

export async function coordinateAgentTurn(
  input: AgentTurnCoordinationInput,
  dependencies: AgentCoordinationDependencies = defaultDependencies,
): Promise<AgentTurnCoordination> {
  const transactionId = transactionIdForTurn(input)
  if (!transactionId) return { outcome: 'not_applicable' }
  if (!isAgentCoordinationEnabled()) return { outcome: 'disabled' }

  const lease = await dependencies.claimTransactionCategorization({
    transactionId,
    conversationId: input.conversationId,
    companyId: input.companyId,
    userId: input.userId,
  })
  return lease ? { outcome: 'acquired', lease } : { outcome: 'contended' }
}

export function transactionIdForTurn(
  input: Pick<AgentTurnCoordinationInput, 'intentId' | 'intentArgs' | 'contextRef'>,
): string | null {
  if (input.intentId !== TRANSACTION_CATEGORIZATION_INTENT) return null

  const fromArgs = input.intentArgs?.transaction_id
  if (typeof fromArgs === 'string' && fromArgs.length > 0) return fromArgs

  if (input.contextRef?.startsWith(TRANSACTION_CONTEXT_PREFIX)) {
    const fromContext = input.contextRef.slice(TRANSACTION_CONTEXT_PREFIX.length)
    return fromContext.length > 0 ? fromContext : null
  }

  return null
}
