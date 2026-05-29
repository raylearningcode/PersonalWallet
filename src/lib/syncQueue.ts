import { supabase } from './supabase'
import { getQueue, removeFromQueue, isNetworkError } from './offlineCache'

export async function processSyncQueue(): Promise<number> {
  const queue = getQueue()
  if (queue.length === 0) return 0

  let processed = 0
  for (const item of queue) {
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
      // Non-network error (constraint violation, etc.) — drop the item so it doesn't block the queue
      removeFromQueue(item.id)
      processed++
    }
  }
  return processed
}
