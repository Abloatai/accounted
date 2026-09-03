import type {
  AgentCoordinationDependencies,
  AgentWorkClaimInput,
  AgentWorkCoordination,
} from './contract'
import {
  claimAgentWorkWithAblo,
  isAgentCoordinationEnabled,
} from './ablo/client'

const defaultDependencies: AgentCoordinationDependencies = {
  claimAgentWork: claimAgentWorkWithAblo,
}

export class AgentWorkContendedError extends Error {
  readonly code = 'AGENT_WORK_CLAIMED'

  constructor() {
    super('Another agent is already working on this Accounted target.')
    this.name = 'AgentWorkContendedError'
  }
}

export async function releaseAgentWorkLease(
  coordination: AgentWorkCoordination,
): Promise<void> {
  if (coordination.outcome !== 'acquired') return
  try {
    await coordination.lease.release()
  } catch {
    // The 30 second server TTL is the final cleanup backstop during an outage.
  }
}

export async function runCoordinatedAgentWork<Result>(
  input: AgentWorkClaimInput,
  work: () => Promise<Result>,
  dependencies?: AgentCoordinationDependencies,
): Promise<Result> {
  const coordination = await coordinateAgentWork(input, dependencies)
  if (coordination.outcome === 'contended') throw new AgentWorkContendedError()
  try {
    return await work()
  } finally {
    await releaseAgentWorkLease(coordination)
  }
}

export async function coordinateAgentWork(
  input: AgentWorkClaimInput,
  dependencies: AgentCoordinationDependencies = defaultDependencies,
): Promise<AgentWorkCoordination> {
  if (input.targets.length === 0) return { outcome: 'not_applicable' }
  if (!isAgentCoordinationEnabled()) return { outcome: 'disabled' }

  const lease = await dependencies.claimAgentWork(input)
  return lease ? { outcome: 'acquired', lease } : { outcome: 'contended' }
}
