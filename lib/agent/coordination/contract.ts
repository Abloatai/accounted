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

export interface TransactionCategorizationClaimInput {
  readonly transactionId: string
  readonly conversationId: string
  readonly companyId: string
  readonly userId: string
}

export interface AgentCoordinationDependencies {
  claimTransactionCategorization(
    input: TransactionCategorizationClaimInput,
  ): Promise<AgentTurnLease | null>
}
