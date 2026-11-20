import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AgentWorkContendedError,
  runCoordinatedAgentWork,
} from '../work'

const input = {
  targets: [{ scope: 'resource' as const, id: 'invoice:1', description: 'test' }],
  participantId: 'agent-1',
  companyId: 'company-1',
  userId: 'user-1',
}

afterEach(() => vi.unstubAllEnvs())

describe('runCoordinatedAgentWork', () => {
  it('does not run contended work', async () => {
    vi.stubEnv('ABLO_COORDINATION_ENABLED', 'true')
    const work = vi.fn()

    await expect(
      runCoordinatedAgentWork(input, work, {
        claimAgentWork: vi.fn(async () => null),
      }),
    ).rejects.toBeInstanceOf(AgentWorkContendedError)
    expect(work).not.toHaveBeenCalled()
  })

  it('releases after successful and failed work', async () => {
    vi.stubEnv('ABLO_COORDINATION_ENABLED', 'true')
    const release = vi.fn(async () => undefined)
    const dependencies = { claimAgentWork: vi.fn(async () => ({ release })) }

    await expect(
      runCoordinatedAgentWork(input, async () => 'done', dependencies),
    ).resolves.toBe('done')
    await expect(
      runCoordinatedAgentWork(
        input,
        async () => {
          throw new Error('failed')
        },
        dependencies,
      ),
    ).rejects.toThrow('failed')
    expect(release).toHaveBeenCalledTimes(2)
  })
})
