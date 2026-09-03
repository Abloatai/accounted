import type {
  AgentCoordinationDependencies,
  AgentTurnCoordination,
  AgentTurnCoordinationInput,
  AgentWorkTarget,
} from './contract'
import { coordinateAgentWork } from './work'

const TRANSACTION_CATEGORIZATION_INTENT = 'transaction.categorization'
const TRANSACTION_CONTEXT_PREFIX = 'transaction:'

export async function coordinateAgentTurn(
  input: AgentTurnCoordinationInput,
  dependencies?: AgentCoordinationDependencies,
): Promise<AgentTurnCoordination> {
  const targets: AgentWorkTarget[] = [
    {
      scope: 'conversation',
      id: input.conversationId,
      description: `running Accounted agent conversation ${input.conversationId}`,
    },
  ]
  const resourceId = resourceIdForTurn(input)
  if (resourceId) {
    targets.push({
      scope: 'resource',
      id: resourceId,
      description: `working on Accounted resource ${resourceId}`,
    })
  }

  return coordinateAgentWork(
    {
      targets,
      participantId: input.conversationId,
      companyId: input.companyId,
      userId: input.userId,
    },
    dependencies,
  )
}

export function resourceIdForTurn(
  input: Pick<AgentTurnCoordinationInput, 'intentId' | 'intentArgs' | 'contextRef'>,
): string | null {
  if (input.contextRef) return input.contextRef

  const transactionId = transactionIdForTurn(input)
  if (transactionId) return `transaction:${transactionId}`

  const args = input.intentArgs
  const candidates = [
    ['invoice', args?.invoice_id],
    ['supplier_invoice', args?.supplier_invoice_id],
    ['verifikation', args?.journal_entry_id],
  ] as const
  for (const [kind, value] of candidates) {
    if (typeof value === 'string' && value.length > 0) return `${kind}:${value}`
  }
  return null
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
