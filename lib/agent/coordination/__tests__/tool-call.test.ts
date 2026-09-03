import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentWorkTargetsForTool, runCoordinatedToolCall } from '../tool-call'

afterEach(() => {
  delete process.env.ABLO_COORDINATION_ENABLED
})

describe('agentWorkTargetsForTool', () => {
  it('maps different operations on one entity to the same resource target', () => {
    const update = agentWorkTargetsForTool('gnubok_update_invoice', { invoice_id: 'invoice-1' })
    const remove = agentWorkTargetsForTool('gnubok_delete_draft_invoice', {
      invoice_id: 'invoice-1',
    })

    expect(update[0].id).toBe('invoice:invoice-1')
    expect(remove[0].id).toBe('invoice:invoice-1')
  })

  it('uses a stable exact-call target when no entity id is present', () => {
    const left = agentWorkTargetsForTool('gnubok_create_customer', {
      name: 'Acme',
      payment_terms: 30,
    })
    const right = agentWorkTargetsForTool('gnubok_create_customer', {
      payment_terms: 30,
      name: 'Acme',
    })

    expect(left[0]).toEqual(right[0])
    expect(left[0].scope).toBe('tool')
  })

  it('maps bulk entity ids to individual resource targets', () => {
    const targets = agentWorkTargetsForTool('gnubok_bulk_categorize', {
      transaction_ids: ['transaction-1', 'transaction-2'],
    })

    expect(targets.map((target) => target.id)).toEqual([
      'transaction:transaction-1',
      'transaction:transaction-2',
    ])
  })

  it('does not claim the same resource twice', () => {
    const targets = agentWorkTargetsForTool('gnubok_sync_bank', {
      connection_id: 'connection-1',
      bank_connection_id: 'connection-1',
    })

    expect(targets.map((target) => target.id)).toEqual(['bank_connection:connection-1'])
  })
})

describe('runCoordinatedToolCall', () => {
  it('does not coordinate read-only calls', async () => {
    process.env.ABLO_COORDINATION_ENABLED = 'true'
    const claimAgentWork = vi.fn()

    await expect(runCoordinatedToolCall(
      {
        toolName: 'gnubok_list_invoices',
        args: {},
        isWrite: false,
        participantId: 'mcp:call-1',
        companyId: 'company-1',
        userId: 'user-1',
      },
      async () => 'read',
      { claimAgentWork },
    )).resolves.toBe('read')
    expect(claimAgentWork).not.toHaveBeenCalled()
  })

  it('coordinates writes and releases the claim', async () => {
    process.env.ABLO_COORDINATION_ENABLED = 'true'
    const release = vi.fn().mockResolvedValue(undefined)
    const claimAgentWork = vi.fn().mockResolvedValue({ release })

    await expect(runCoordinatedToolCall(
      {
        toolName: 'gnubok_update_invoice',
        args: { invoice_id: 'invoice-1' },
        isWrite: true,
        participantId: 'mcp:call-2',
        companyId: 'company-1',
        userId: 'user-1',
      },
      async () => 'written',
      { claimAgentWork },
    )).resolves.toBe('written')
    expect(claimAgentWork).toHaveBeenCalledWith(expect.objectContaining({
      targets: [expect.objectContaining({ id: 'invoice:invoice-1' })],
    }))
    expect(release).toHaveBeenCalledOnce()
  })

  it('does not coordinate dry runs of write tools', async () => {
    process.env.ABLO_COORDINATION_ENABLED = 'true'
    const claimAgentWork = vi.fn()

    await expect(runCoordinatedToolCall(
      {
        toolName: 'gnubok_create_invoice',
        args: { dry_run: true },
        isWrite: true,
        participantId: 'mcp:call-3',
        companyId: 'company-1',
        userId: 'user-1',
      },
      async () => 'previewed',
      { claimAgentWork },
    )).resolves.toBe('previewed')
    expect(claimAgentWork).not.toHaveBeenCalled()
  })
})
