// Transaction tags management
const TAGS_STORAGE_KEY = 'finpath_transaction_tags'
const TX_TAGS_STORAGE_KEY = 'finpath_tx_tags'

export interface Tag {
  id: string
  name: string
  color: string
  createdAt: number
}

export interface TransactionTag {
  transactionId: string
  tagId: string
}

const TAG_COLORS = [
  '#FF6B6B', '#FF8E72', '#FFD93D', '#6BCF7F', '#4D96FF',
  '#B19CD9', '#FF69B4', '#20B2AA', '#FF6347', '#FFD700',
]

export function getTags(): Tag[] {
  try {
    const stored = localStorage.getItem(TAGS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function addTag(name: string, color?: string): Tag {
  const tags = getTags()
  const tag: Tag = {
    id: crypto.randomUUID(),
    name,
    color: color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)],
    createdAt: Date.now(),
  }
  tags.push(tag)
  try {
    localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags))
  } catch (err) {
    console.warn('Failed to save tag:', err)
  }
  return tag
}

export function updateTag(id: string, name: string, color: string): boolean {
  const tags = getTags()
  const tag = tags.find(t => t.id === id)
  if (!tag) return false
  tag.name = name
  tag.color = color
  try {
    localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags))
    return true
  } catch {
    return false
  }
}

export function deleteTag(id: string): boolean {
  const tags = getTags().filter(t => t.id !== id)
  try {
    localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags))
    removeTagFromAllTransactions(id)
    return true
  } catch {
    return false
  }
}

export function getTransactionTags(transactionId: string): Tag[] {
  try {
    const stored = localStorage.getItem(TX_TAGS_STORAGE_KEY)
    const txTags: TransactionTag[] = stored ? JSON.parse(stored) : []
    const tagIds = txTags.filter(t => t.transactionId === transactionId).map(t => t.tagId)
    const tags = getTags()
    return tags.filter(t => tagIds.includes(t.id))
  } catch {
    return []
  }
}

export function addTagToTransaction(transactionId: string, tagId: string): boolean {
  try {
    const stored = localStorage.getItem(TX_TAGS_STORAGE_KEY)
    const txTags: TransactionTag[] = stored ? JSON.parse(stored) : []

    // Avoid duplicates
    if (txTags.some(t => t.transactionId === transactionId && t.tagId === tagId)) {
      return true
    }

    txTags.push({ transactionId, tagId })
    localStorage.setItem(TX_TAGS_STORAGE_KEY, JSON.stringify(txTags))
    return true
  } catch {
    return false
  }
}

export function removeTagFromTransaction(transactionId: string, tagId: string): boolean {
  try {
    const stored = localStorage.getItem(TX_TAGS_STORAGE_KEY)
    const txTags: TransactionTag[] = stored ? JSON.parse(stored) : []
    const filtered = txTags.filter(t => !(t.transactionId === transactionId && t.tagId === tagId))
    localStorage.setItem(TX_TAGS_STORAGE_KEY, JSON.stringify(filtered))
    return true
  } catch {
    return false
  }
}

export function removeTagFromAllTransactions(tagId: string): boolean {
  try {
    const stored = localStorage.getItem(TX_TAGS_STORAGE_KEY)
    const txTags: TransactionTag[] = stored ? JSON.parse(stored) : []
    const filtered = txTags.filter(t => t.tagId !== tagId)
    localStorage.setItem(TX_TAGS_STORAGE_KEY, JSON.stringify(filtered))
    return true
  } catch {
    return false
  }
}

export function getDefaultTagColors(): string[] {
  return TAG_COLORS
}
