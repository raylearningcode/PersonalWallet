const CACHE_PFX = 'finpath_cache_'
const QUEUE_KEY = 'finpath_sync_queue'

// ─── Read cache (mirrors last-known Supabase data) ────────────────────────────

export function cacheSet(key: string, data: unknown) {
  try {
    localStorage.setItem(CACHE_PFX + key, JSON.stringify(data))
  } catch (err) {
    console.warn(`Failed to cache ${key}:`, err instanceof Error ? err.message : 'Unknown error')
  }
}

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PFX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

// Optimistic updates to the read cache while offline
export function cacheAddItem<T extends { id: string }>(key: string, item: T) {
  const list = cacheGet<T[]>(key) ?? []
  cacheSet(key, [item, ...list])
}

export function cacheUpdateItem(key: string, id: string, patch: Record<string, unknown>) {
  const list = cacheGet<Array<Record<string, unknown>>>(key) ?? []
  cacheSet(key, list.map(item => item['id'] === id ? { ...item, ...patch } : item))
}

export function cacheDeleteItem(key: string, id: string) {
  const list = cacheGet<Array<{ id: string }>>(key) ?? []
  cacheSet(key, list.filter(item => item.id !== id))
}

// ─── Sync queue (offline mutations to replay when reconnected) ─────────────────

export type QueuedMutation = {
  id: string
  table: string
  op: 'insert' | 'update' | 'delete' | 'upsert'
  data?: Record<string, unknown>
  matchId?: string
  upsertConflict?: string
  userId: string
  timestamp: number
  /** Number of times this item has failed with a transient (non-network) error. Defaults to 0. */
  attempts?: number
}

export function getQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Tolerate malformed entries — keep only entries that look like mutations
    return parsed.filter((e: unknown): e is QueuedMutation =>
      e !== null && typeof e === 'object' &&
      typeof (e as Record<string, unknown>).op === 'string' &&
      typeof (e as Record<string, unknown>).table === 'string'
    )
  } catch { return [] }
}

export function enqueue(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>) {
  const queue = getQueue()
  queue.push({ ...mutation, id: crypto.randomUUID(), timestamp: Date.now() })
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch (err) {
    console.warn('Failed to enqueue mutation:', err instanceof Error ? err.message : 'Unknown error')
  }
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter(item => item.id !== id)
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch (err) {
    console.warn('Failed to remove from queue:', err instanceof Error ? err.message : 'Unknown error')
  }
}

// ─── Network detection ────────────────────────────────────────────────────────

export function isOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase()
    return msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch') || msg.includes('load failed')
  }
  return false
}

// ─── Generic fetch helper ──────────────────────────────────────────────────────

export async function fetchWithCache<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  fallback: T
): Promise<T> {
  if (isOffline()) {
    return cacheGet<T>(cacheKey) ?? fallback
  }
  try {
    const result = await fetchFn()
    cacheSet(cacheKey, result)
    return result
  } catch (e) {
    if (isNetworkError(e)) {
      return cacheGet<T>(cacheKey) ?? fallback
    }
    throw e
  }
}
