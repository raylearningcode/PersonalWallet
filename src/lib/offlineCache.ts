const CACHE_PFX = 'finpath_cache_'
const QUEUE_KEY = 'finpath_sync_queue'

// ─── Read cache (mirrors last-known Supabase data) ────────────────────────────

export function cacheSet(key: string, data: unknown) {
  try { localStorage.setItem(CACHE_PFX + key, JSON.stringify(data)) } catch {}
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
}

export function getQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : []
  } catch { return [] }
}

export function enqueue(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>) {
  const queue = getQueue()
  queue.push({ ...mutation, id: crypto.randomUUID(), timestamp: Date.now() })
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)) } catch {}
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter(item => item.id !== id)
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)) } catch {}
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY)
}

// ─── Network detection ────────────────────────────────────────────────────────

export function isOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true
  if (e instanceof Error) {
    const msg = e.message.toLowerCase()
    return msg.includes('network') || msg.includes('failed to fetch') || msg.includes('offline')
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
