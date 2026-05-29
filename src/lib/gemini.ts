const GEMINI_KEY_STORAGE = 'finpath_gemini_key'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

export function getGeminiKey(): string | null {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || localStorage.getItem(GEMINI_KEY_STORAGE)
}

export function saveGeminiKey(key: string) {
  if (key) localStorage.setItem(GEMINI_KEY_STORAGE, key)
  else localStorage.removeItem(GEMINI_KEY_STORAGE)
}

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } }

async function callGemini(parts: GeminiPart[]): Promise<string> {
  const key = getGeminiKey()
  if (!key) throw new Error('No Gemini API key. Add it in Settings → AI Features.')
  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${body}`)
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export type ReceiptData = {
  description: string
  amount: string
  category: string
  date: string
}

export async function scanReceipt(imageBase64: string, mimeType: string): Promise<ReceiptData> {
  const prompt = `Extract receipt info as JSON only — no markdown, no explanation:
{"description":"merchant name","amount":"total as plain number","category":"one of Food/Transport/Shopping/Entertainment/Health/Bills/Other","date":"YYYY-MM-DD or empty"}`

  const text = await callGemini([
    { text: prompt },
    { inline_data: { mime_type: mimeType, data: imageBase64 } },
  ])

  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) throw new Error('Could not parse receipt — try a clearer photo')
  return JSON.parse(match[0]) as ReceiptData
}

export type InsightInput = {
  monthlySpent: number
  monthlyIncome: number
  categoryBreakdown: Array<{ name: string; amount: number; budget: number }>
  savingsRate: number
  currency: string
}

export async function getAiInsights(data: InsightInput): Promise<string[]> {
  const cats = data.categoryBreakdown
    .slice(0, 6)
    .map(c => `${c.name}: spent ${data.currency} ${c.amount.toFixed(0)} / budget ${data.currency} ${c.budget.toFixed(0)}`)
    .join('; ')

  const prompt = `Personal finance advisor. This month: income ${data.currency} ${data.monthlyIncome.toFixed(0)}, spending ${data.currency} ${data.monthlySpent.toFixed(0)}, savings rate ${data.savingsRate}%. Categories: ${cats || 'none'}.

Give exactly 3 short actionable insights, each one sentence. Return JSON array only, no markdown:
["insight1","insight2","insight3"]`

  const text = await callGemini([{ text: prompt }])
  const match = text.match(/\[[\s\S]*?\]/)
  if (!match) throw new Error('Could not parse insights response')
  return JSON.parse(match[0]) as string[]
}
