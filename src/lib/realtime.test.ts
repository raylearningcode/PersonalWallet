import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { startRealtimeSync } from './realtime'

const h = vi.hoisted(() => {
  const on = vi.fn()
  const channelObj = { on, subscribe: vi.fn() }
  on.mockReturnValue(channelObj)
  return {
    on,
    channelObj,
    subscribe: channelObj.subscribe,
    removeChannel: vi.fn(),
    channel: vi.fn(() => channelObj),
  }
})

vi.mock('./supabase', () => ({
  supabase: { channel: h.channel, removeChannel: h.removeChannel },
}))

const qc = { invalidateQueries: vi.fn() } as unknown as QueryClient

function callbackFor(table: string): () => void {
  const call = h.on.mock.calls.find(c => (c[1] as { table: string }).table === table)
  expect(call).toBeDefined()
  return call![2] as () => void
}

function lastPredicate(): (q: { queryKey: readonly unknown[] }) => boolean {
  const calls = (qc.invalidateQueries as ReturnType<typeof vi.fn>).mock.calls
  return calls[calls.length - 1][0].predicate
}

describe('startRealtimeSync', () => {
  beforeEach(() => {
    h.on.mockClear()
    h.subscribe.mockClear()
    h.removeChannel.mockClear()
    h.channel.mockClear()
    ;(qc.invalidateQueries as ReturnType<typeof vi.fn>).mockClear()
  })

  it('subscribes to every app table and invalidates the matching query keys', () => {
    const stop = startRealtimeSync(qc)

    expect(h.channel).toHaveBeenCalledWith('finpath-realtime')
    expect(h.subscribe).toHaveBeenCalledTimes(1)

    const tables = h.on.mock.calls.map(c => (c[1] as { table: string }).table)
    expect(tables).toHaveLength(10)
    expect(tables).toEqual(expect.arrayContaining(['wallets', 'transactions', 'recurring_rules', 'goals', 'holdings', 'dividend_logs']))

    // A transactions event invalidates ['transactions', ...] keys only.
    callbackFor('transactions')()
    const txPredicate = lastPredicate()
    expect(txPredicate({ queryKey: ['transactions', 'all'] })).toBe(true)
    expect(txPredicate({ queryKey: ['wallets'] })).toBe(false)

    // dividend_logs maps to the ['dividends', ...] key.
    callbackFor('dividend_logs')()
    const divPredicate = lastPredicate()
    expect(divPredicate({ queryKey: ['dividends', 'all'] })).toBe(true)
    expect(divPredicate({ queryKey: ['transactions', 'all'] })).toBe(false)

    stop()
    expect(h.removeChannel).toHaveBeenCalledWith(h.channelObj)
  })
})
