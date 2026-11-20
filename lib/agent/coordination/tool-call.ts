import { createHash } from 'node:crypto'
import type { AgentCoordinationDependencies, AgentWorkTarget } from './contract'
import { runCoordinatedAgentWork } from './work'

const RESOURCE_KEYS = [
  ['transaction_id', 'transaction'],
  ['invoice_id', 'invoice'],
  ['supplier_invoice_id', 'supplier_invoice'],
  ['journal_entry_id', 'journal_entry'],
  ['entry_id', 'journal_entry'],
  ['operation_id', 'pending_operation'],
  ['period_id', 'fiscal_period'],
  ['fiscal_period_id', 'fiscal_period'],
  ['customer_id', 'customer'],
  ['supplier_id', 'supplier'],
  ['employee_id', 'employee'],
  ['salary_run_id', 'salary_run'],
  ['document_id', 'document'],
  ['inbox_item_id', 'inbox_item'],
  ['schedule_id', 'recurring_schedule'],
  ['asset_id', 'asset'],
  ['sales_order_id', 'sales_order'],
  ['sales_order_item_id', 'sales_order_item'],
  ['article_id', 'article'],
  ['connection_id', 'bank_connection'],
  ['bank_connection_id', 'bank_connection'],
  ['cash_account_id', 'cash_account'],
  ['fact_id', 'fact'],
  ['trip_id', 'trip'],
  ['upload_id', 'upload'],
  ['idempotency_key', 'idempotency_key'],
] as const

const RESOURCE_LIST_KEYS = [
  ['transaction_ids', 'transaction'],
  ['tx_ids', 'transaction'],
  ['invoice_ids', 'invoice'],
  ['journal_entry_ids', 'journal_entry'],
  ['asset_ids', 'asset'],
  ['trip_ids', 'trip'],
  ['item_ids', 'inbox_item'],
] as const

interface CoordinatedToolCallInput {
  toolName: string
  args: Record<string, unknown>
  isWrite: boolean
  participantId: string
  companyId: string
  userId: string
}

export async function runCoordinatedToolCall<Result>(
  input: CoordinatedToolCallInput,
  work: () => Promise<Result>,
  dependencies?: AgentCoordinationDependencies,
): Promise<Result> {
  if (!input.isWrite || input.args.dry_run === true) return work()
  return runCoordinatedAgentWork(
    {
      targets: agentWorkTargetsForTool(input.toolName, input.args),
      participantId: input.participantId,
      companyId: input.companyId,
      userId: input.userId,
    },
    work,
    dependencies,
  )
}

export function agentWorkTargetsForTool(
  toolName: string,
  args: Record<string, unknown>,
): AgentWorkTarget[] {
  const targets: AgentWorkTarget[] = []
  for (const [key, kind] of RESOURCE_KEYS) {
    const value = args[key]
    if (typeof value !== 'string' || value.length === 0) continue
    targets.push({
      scope: 'resource',
      id: `${kind}:${value}`,
      description: `running Accounted tool ${toolName} on ${kind}`,
    })
  }
  for (const [key, kind] of RESOURCE_LIST_KEYS) {
    const values = args[key]
    if (!Array.isArray(values)) continue
    for (const value of values) {
      if (typeof value !== 'string' || value.length === 0) continue
      targets.push({
        scope: 'resource',
        id: `${kind}:${value}`,
        description: `running Accounted tool ${toolName} on ${kind}`,
      })
    }
  }
  if (targets.length > 0) return uniqueTargets(targets)

  const fingerprint = createHash('sha256')
    .update(stableStringify(args))
    .digest('hex')
    .slice(0, 24)
  return [
    {
      scope: 'tool',
      id: `${toolName}:${fingerprint}`,
      description: `running Accounted tool ${toolName}`,
    },
  ]
}

function uniqueTargets(targets: AgentWorkTarget[]): AgentWorkTarget[] {
  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = `${target.scope}:${target.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}
