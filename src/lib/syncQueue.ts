import { supabase } from './supabase'
import { enqueue, getQueue, isNetworkError, removeFromQueue } from './offlineCache'
import type { QueuedMutation } from './offlineCache'

/** Give up on a queue item after this many transient non-network failures. */
const MAX_ATTEMPTS = 5
/** Supabase error codes that are known-permanent and should never be retried. */
const PERMANENT_ERROR_CODES = new Set(['23505', '404'])

/**
 * Known-permanent failures: HTTP 4xx responses (except 429 rate-limit) and
 * Supabase error codes 23505 (duplicate key) / 404 (missing row).
 * Everything else that is not a network error is treated as transient and retried.
 */
function isPermanentFailure(e: unknown): boolean {
  if (e === null || typeof e !== 'object') return false
  const err = e as Record<string, unknown>
  if (typeof err.code === 'string' && PERMANENT_ERROR_CODES.has(err.code)) return true
  const status =
    typeof err.status === 'number' ? err.status
    : typeof err.statusCode === 'number' ? err.statusCode
    : 0
  return status >= 400 && status < 500 && status !== 429
}

function reenqueueForRetry(item: QueuedMutation, attempts: number) {
  enqueue({
    table: item.table,
    op: item.op,
    data: item.data,
    matchId: item.matchId,
    upsertConflict: item.upsertConflict,
    userId: item.userId,
    attempts,
  })
}

export async function processSyncQueue(): Promise<number> {
  const queue = getQueue()
  if (queue.length === 0) return 0

  let processed = 0
  for (const item of queue) {
    if ((item.attempts ?? 0) >= MAX_ATTEMPTS) {
      // Retries exhausted — never process this item again
      removeFromQueue(item.id)
      processed++
      continue
    }
    try {
      if (item.op === 'insert') {
        const { error } = await supabase.from(item.table).insert(item.data as Record<string, unknown>)
        if (error && error.code !== '23505') throw error // ignore duplicate inserts
      } else if (item.op === 'update') {
        const { error } = await supabase
          .from(item.table)
          .update(item.data as Record<string, unknown>)
          .eq('id', item.matchId!)
          .eq('user_id', item.userId)
        if (error) throw error
      } else if (item.op === 'delete') {
        const { error } = await supabase
          .from(item.table)
          .delete()
          .eq('id', item.matchId!)
          .eq('user_id', item.userId)
        if (error) throw error
      } else if (item.op === 'upsert') {
        const opts = item.upsertConflict ? { onConflict: item.upsertConflict } : undefined
        const { error } = await supabase.from(item.table).upsert(item.data as Record<string, unknown>, opts)
        if (error) throw error
      }
      removeFromQueue(item.id)
      processed++
    } catch (e) {
      if (isNetworkError(e)) break // still offline, stop here
      if (isPermanentFailure(e)) {
        // Known-permanent failure (duplicate key, missing row, client 4xx) — drop
        removeFromQueue(item.id)
        processed++
        continue
      }
      // Transient non-network failure — keep the item with an incremented retry counter
      removeFromQueue(item.id)
      const attempts = (item.attempts ?? 0) + 1
      if (attempts >= MAX_ATTEMPTS) {
        processed++ // retries exhausted — drop so it can't block the queue
      } else {
        reenqueueForRetry(item, attempts)
      }
    }
  }
  return processed
}
