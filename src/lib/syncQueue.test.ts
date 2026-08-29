import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueue, getQueue, isNetworkError } from './offlineCache'
import { processSyncQueue } from './syncQueue'

const QUEUE_KEY = 'finpath_sync_queue'

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('./supabase', () => ({
  supabase: {
    from: mockSupabase.from,
    auth: { getSession: vi.fn() },
  },
}))

/**
 * Chainable table builder: every method returns the builder, and awaiting the
 * builder resolves to the next queued query result (mirrors supabase-js).
 */
function makeTable(results: Array<Record<string, unknown>>): Record<string, unknown> {
  const builder: Record<string, unknown> = {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
  }
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(results.shift() ?? { error: null }).then(onFulfilled, onRejected)
  return builder
}

beforeEach(() => {
  localStorage.clear()
  mockSupabase.from.mockReset()
})

describe('isNetworkError', () => {
  it('only classifies fetch-signature TypeErrors as network errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
    expect(isNetworkError(new TypeError('Something broke'))).toBe(false)
    // Non-TypeError errors with network-ish messages are no longer treated as network errors
    expect(isNetworkError(new Error('Network error'))).toBe(false)
    expect(isNetworkError({ code: '23505', message: 'duplicate' })).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})

describe('getQueue', () => {
  it('filters malformed entries but keeps valid ones', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([
      { id: 'a', table: 'transactions', op: 'insert', userId: 'u', timestamp: 1 },
      null,
      'junk',
      42,
      { op: 'insert' },            // missing table
      { table: 'transactions' },   // missing op
      { id: 'b', table: 'wallets', op: 'update', userId: 'u', timestamp: 2 },
    ]))
    const queue = getQueue()
    expect(queue.map(i => i.id)).toEqual(['a', 'b'])
  })

  it('returns [] for non-array or unparseable storage', () => {
    localStorage.setItem(QUEUE_KEY, '{not json')
    expect(getQueue()).toEqual([])
    localStorage.setItem(QUEUE_KEY, '"just a string"')
    expect(getQueue()).toEqual([])
  })
})

describe('processSyncQueue', () => {
  it('re-enqueues transient non-network failures with an incremented attempts counter', async () => {
    mockSupabase.from.mockReturnValue(makeTable([
      { error: { code: '500', message: 'Internal Server Error' } },
      { error: null },
    ]))
    enqueue({ table: 'transactions', op: 'insert', data: { amount: 100 }, userId: 'u1' })

    const count = await processSyncQueue()
    expect(count).toBe(0)
    const queue = getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].attempts).toBe(1)

    const count2 = await processSyncQueue()
    expect(count2).toBe(1)
    expect(getQueue()).toHaveLength(0)
  })

  it('drops items on known-permanent failures (Supabase 23505, HTTP 4xx except 429)', async () => {
    mockSupabase.from.mockReturnValue(makeTable([
      { error: { code: '23505', message: 'duplicate key' } },   // update: duplicate
      { error: { status: 404, message: 'Not found' } },         // delete: 404
      { error: { status: 429, message: 'Too many requests' } }, // upsert: rate-limited → retried
    ]))
    enqueue({ table: 'transactions', op: 'update', data: { amount: 1 }, matchId: 'x', userId: 'u1' })
    enqueue({ table: 'transactions', op: 'delete', matchId: 'x', userId: 'u1' })
    enqueue({ table: 'plans', op: 'upsert', data: { year: 2026 }, userId: 'u1', upsertConflict: 'user_id' })

    const count = await processSyncQueue()
    expect(count).toBe(2) // 23505 + 404 dropped, 429 re-enqueued
    const queue = getQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].op).toBe('upsert')
    expect(queue[0].attempts).toBe(1)
  })

  it('drops an item after MAX_ATTEMPTS (5) transient failures', async () => {
    const transient = { error: { code: '500', message: 'Internal Server Error' } }
    mockSupabase.from.mockReturnValue(makeTable(Array(5).fill(transient)))
    enqueue({ table: 'transactions', op: 'insert', data: { amount: 100 }, userId: 'u1' })

    for (let i = 1; i <= 4; i++) {
      const count = await processSyncQueue()
      expect(count).toBe(0)
      expect(getQueue()).toHaveLength(1)
      expect(getQueue()[0].attempts).toBe(i)
    }
    const count = await processSyncQueue() // 5th failure: retries exhausted
    expect(count).toBe(1)
    expect(getQueue()).toHaveLength(0)
  })

  it('breaks on network errors and leaves the queue untouched', async () => {
    mockSupabase.from.mockReturnValue(makeTable([]))
    mockSupabase.from.mockImplementationOnce(() => {
      throw new TypeError('Failed to fetch')
    })
    enqueue({ table: 'transactions', op: 'insert', data: { amount: 100 }, userId: 'u1' })

    const count = await processSyncQueue()
    expect(count).toBe(0)
    expect(getQueue()).toHaveLength(1)
    expect(getQueue()[0].attempts).toBeUndefined()
  })
})
