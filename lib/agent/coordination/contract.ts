export interface AgentTurnCoordinationInput {
  readonly intentId: string
  readonly intentArgs: Record<string, unknown> | null | undefined
  readonly contextRef: string | null | undefined
  readonly conversationId: string
  readonly companyId: string
  readonly userId: string
}

export interface AgentTurnLease {
  release(): Promise<void>
}

export type AgentTurnCoordination =
  | { readonly outcome: 'not_applicable' }
  | { readonly outcome: 'disabled' }
  | { readonly outcome: 'contended' }
  | { readonly outcome: 'acquired'; readonly lease: AgentTurnLease }

export interface AgentWorkTarget {
  readonly scope: 'conversation' | 'resource' | 'tool'
  readonly id: string
  readonly description: string
}

export interface AgentWorkClaimInput {
  readonly targets: readonly AgentWorkTarget[]
  readonly participantId: string
  readonly companyId: string
  readonly userId: string
}

export type AgentWorkCoordination =
  | { readonly outcome: 'not_applicable' }
  | { readonly outcome: 'disabled' }
  | { readonly outcome: 'contended' }
  | { readonly outcome: 'acquired'; readonly lease: AgentTurnLease }

export interface AgentCoordinationDependencies {
  claimAgentWork(input: AgentWorkClaimInput): Promise<AgentTurnLease | null>
}
