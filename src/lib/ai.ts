// ─── Config storage ──────────────────────────────────────────────────────────

const AI_ENDPOINT_STORAGE = 'finpath_ai_endpoint'
const AI_KEY_STORAGE = 'finpath_ai_key'

// Default endpoint — pre-configured so users don't need to set anything up.
// Change this to your hosted API URL. Users can override in Settings if needed.
const DEFAULT_ENDPOINT = (import.meta.env.VITE_AI_API_ENDPOINT as string | undefined) || ''

export function getAiEndpoint(): string {
  return localStorage.getItem(AI_ENDPOINT_STORAGE) || DEFAULT_ENDPOINT
}

export function saveAiEndpoint(url: string) {
  if (url) localStorage.setItem(AI_ENDPOINT_STORAGE, url)
  else localStorage.removeItem(AI_ENDPOINT_STORAGE)
}

export function getAiKey(): string | null {
  // Never read API key from env vars — VITE_ prefixed vars are public in the bundle.
  return localStorage.getItem(AI_KEY_STORAGE) || null
}

export function saveAiKey(key: string) {
  if (key) localStorage.setItem(AI_KEY_STORAGE, key)
  else localStorage.removeItem(AI_KEY_STORAGE)
}

export function isAiConfigured(): boolean {
  return !!getAiEndpoint()
}

// ─── API caller ──────────────────────────────────────────────────────────────

async function callAiApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const endpoint = getAiEndpoint()
  if (!endpoint) throw new Error('AI API not configured. Set your API endpoint in Settings → AI Features.')

  const key = getAiKey()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['Authorization'] = `Bearer ${key}`

  const res = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AI API error ${res.status}: ${text.slice(0, 200)}`)
  }

  return res.json() as Promise<T>
}

// ─── Receipt scanning ────────────────────────────────────────────────────────

export type ReceiptData = {
  description: string
  amount: string
  category: string
  date: string
}

export async function scanReceipt(imageBase64: string, mimeType: string): Promise<ReceiptData> {
  return callAiApi<ReceiptData>('/api/scan-receipt', {
    image: imageBase64,
    mime_type: mimeType,
  })
}

// ─── AI Financial Insights ───────────────────────────────────────────────────

export type InsightType = 'warning' | 'opportunity' | 'tip' | 'alert'

export type InsightResult = {
  title: string
  detail: string
  type: InsightType
}

export type InsightInput = {
  currency: string
  monthlyIncome: number
  monthlySpent: number
  daysLeftInMonth: number
  annualIncome: number
  annualSpent: number
  savingsRate: number
  netWorth: number
  cashBalance: number
  invested: number
  categories: Array<{ name: string; spent: number; budget: number }>
  goals: Array<{ name: string; current: number; target: number; pct: number }>
  overBudget: Array<{ name: string; overage: number; pct: number }>
}

export async function getAiInsights(data: InsightInput): Promise<InsightResult[]> {
  return callAiApi<InsightResult[]>('/api/insights', { data })
}
