import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  coordinateAgentTurn: vi.fn(),
  runChatTurn: vi.fn(),
}))

vi.mock('@/lib/init', () => ({ ensureInitialized: vi.fn() }))
vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: vi.fn(async () => ({
    user: { id: 'user-1' },
    supabase: createSupabaseMock(),
    error: null,
  })),
}))
vi.mock('@/lib/company/context', () => ({
  getActiveCompanyId: vi.fn(async () => '10000000-0000-4000-8000-000000000001'),
}))
vi.mock('@/lib/agent/intents/registry', () => ({
  getIntent: vi.fn(() => ({
    id: 'transaction.categorization',
    sheetTitle: 'Kategorisera transaktion',
  })),
}))
vi.mock('@/lib/rate-limits/agent', () => ({
  checkAgentRateLimit: vi.fn(async () => ({ ok: true })),
  agentRateLimitResponseBody: vi.fn(),
}))
vi.mock('@/lib/agent/chat/run-turn', () => ({
  runChatTurn: mocks.runChatTurn,
  friendlyModelError: vi.fn(() => 'Modellfel'),
}))
vi.mock('@/lib/ai', () => ({
  getAiStatus: vi.fn(() => ({ assistantAvailable: true })),
}))
vi.mock('@/lib/sandbox/guard', () => ({ guardSandbox: vi.fn(async () => null) }))
vi.mock('@/lib/entitlements/has-capability', () => ({
  requireCapability: vi.fn(async () => null),
}))
vi.mock('@/lib/entitlements/keys', () => ({ CAPABILITY: { ai: 'ai' } }))
vi.mock('@/lib/agent/coordination', () => {
  class AgentCoordinationUnavailableError extends Error {}
  return {
    AgentCoordinationUnavailableError,
    coordinateAgentTurn: mocks.coordinateAgentTurn,
  }
})

import { POST } from '../route'
import { AgentCoordinationUnavailableError } from '@/lib/agent/coordination'

const requestBody = {
  intent_id: 'transaction.categorization',
  intent_args: { transaction_id: '20000000-0000-4000-8000-000000000002' },
  context_ref: 'transaction:20000000-0000-4000-8000-000000000002',
  user_message: 'Hjälp mig kategorisera den här.',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runChatTurn.mockImplementation(async ({ emit }) => {
    emit({ kind: 'text_delta', text: 'Klart' })
  })
})

describe('POST /api/agent/invoke coordination', () => {
  it('returns 409 before model work when another participant holds the claim', async () => {
    mocks.coordinateAgentTurn.mockResolvedValue({ outcome: 'contended' })

    const response = await POST(makeRequest())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'agent_work_claimed' })
    expect(mocks.runChatTurn).not.toHaveBeenCalled()
  })

  it('fails closed when enabled coordination is unavailable', async () => {
    mocks.coordinateAgentTurn.mockRejectedValue(
      new AgentCoordinationUnavailableError('unavailable'),
    )

    const response = await POST(makeRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code: 'coordination_unavailable' })
    expect(mocks.runChatTurn).not.toHaveBeenCalled()
  })

  it('holds the claim through the streamed turn and releases it afterward', async () => {
    const release = vi.fn(async () => undefined)
    mocks.coordinateAgentTurn.mockResolvedValue({
      outcome: 'acquired',
      lease: { release },
    })

    const response = await POST(makeRequest())

    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))

    expect(response.status).toBe(200)
    expect(events[0]).toMatchObject({ kind: 'conversation' })
    expect(events[0].conversation_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(mocks.runChatTurn).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
    expect(mocks.runChatTurn.mock.invocationCallOrder[0]).toBeLessThan(
      release.mock.invocationCallOrder[0],
    )
  })
})

function makeRequest(): Request {
  return new Request('http://localhost/api/agent/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })
}

function createSupabaseMock() {
  return {
    from(table: string) {
      if (table === 'company_members') return query({ role: 'owner' })
      if (table === 'companies') return query({ name: 'Testbolaget' })
      if (table === 'profiles') return query({ full_name: 'Test User' })
      if (table === 'agent_conversations') {
        return {
          insert: vi.fn(() => query({ id: '30000000-0000-4000-8000-000000000003' })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

function query(data: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({ data, error: null })),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  }
  return builder
}
