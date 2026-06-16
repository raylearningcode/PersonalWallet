import type { Transaction } from '@/types'

export interface UndoEntry {
  id: string
  transactions: Transaction[]
  timestamp: number
}

const UNDO_STORAGE_KEY = 'finpath_undo_stack'
const UNDO_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

export function pushUndo(transactions: Transaction[]): string {
  const entry: UndoEntry = {
    id: crypto.randomUUID(),
    transactions,
    timestamp: Date.now(),
  }

  try {
    const stack = getUndoStack()
    stack.push(entry)
    // Keep only last 20 entries to avoid bloating localStorage
    if (stack.length > 20) stack.shift()
    localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(stack))
    return entry.id
  } catch (err) {
    console.warn('Failed to save undo entry:', err instanceof Error ? err.message : 'Unknown error')
    return ''
  }
}

export function getUndoStack(): UndoEntry[] {
  try {
    const stored = localStorage.getItem(UNDO_STORAGE_KEY)
    if (!stored) return []
    const stack = JSON.parse(stored) as UndoEntry[]
    // Remove expired entries
    const now = Date.now()
    return stack.filter(entry => now - entry.timestamp < UNDO_TIMEOUT_MS)
  } catch {
    return []
  }
}

export function popUndo(id: string): Transaction[] | null {
  try {
    const stack = getUndoStack()
    const index = stack.findIndex(entry => entry.id === id)
    if (index === -1) return null
    const entry = stack[index]
    stack.splice(index, 1)
    localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(stack))
    return entry.transactions
  } catch (err) {
    console.warn('Failed to recover undo entry:', err instanceof Error ? err.message : 'Unknown error')
    return null
  }
}

export function hasUndo(): boolean {
  return getUndoStack().length > 0
}
