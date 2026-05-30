const GEMINI_KEY_STORAGE = 'finpath_gemini_key'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'

const ADVISOR_SYSTEM_PROMPT = `You are FinPath AI — a personal finance budgeting assistant that helps users understand their own spending data. You provide educational observations to support self-directed financial decisions.

Important: You are not a licensed financial advisor, CFA, CFP, or wealth manager. Nothing you say constitutes financial advice. Always encourage users to consult qualified professionals for investment, tax, or legal decisions.

Your rules:
1. NEVER give generic observations ("save more", "spend less"). Every insight MUST cite the user's actual numbers.
2. Be specific: name the category, the amount, the percentage, the gap.
3. Frame observations educationally — use "you may want to consider" or "based on your data" rather than directives.
4. Prioritise by financial impact — lead with what's most relevant to the user's numbers.
5. Tone: clear, helpful, and grounded. Focus on what the data shows, not prescriptions.
6. If data is insufficient for an insight, skip it — never pad with filler.`

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } }

async function callGemini(systemInstruction: string, parts: GeminiPart[]): Promise<string> {
  const key = getGeminiKey()
  if (!key) throw new Error('No Gemini API key. Add it in Settings → AI Features.')
  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.4, topP: 0.9 },
    }),
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

export function getGeminiKey(): string | null {
  return (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || localStorage.getItem(GEMINI_KEY_STORAGE)
}

export function saveGeminiKey(key: string) {
  if (key) localStorage.setItem(GEMINI_KEY_STORAGE, key)
  else localStorage.removeItem(GEMINI_KEY_STORAGE)
}

// ─── Receipt scanning ──────────────────────────────────────────────────────────

export type ReceiptData = {
  description: string
  amount: string
  category: string
  date: string
}

export async function scanReceipt(imageBase64: string, mimeType: string): Promise<ReceiptData> {
  const prompt = `Extract the following fields from this receipt image. Return compact JSON only — no markdown, no explanation, no trailing text.

Required fields:
- "description": the merchant or store name (e.g. "McDonald's", "Shell", "IKEA")
- "amount": the final total amount as a plain number string without currency symbols or commas (e.g. "42500" or "12.50")
- "category": classify into exactly one of: Food, Transport, Shopping, Entertainment, Health, Bills, Other
- "date": the purchase date in YYYY-MM-DD format; use empty string "" if not visible

Example output: {"description":"Starbucks","amount":"65000","category":"Food","date":"2026-05-28"}`

  const text = await callGemini(
    'You are a precise receipt OCR and data extraction system. Extract data accurately from receipt images.',
    [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
  )

  const match = text.match(/\{[\s\S]*?\}/)
  if (!match) throw new Error('Could not parse receipt — try a clearer photo')
  return JSON.parse(match[0]) as ReceiptData
}

// ─── AI Financial Insights ─────────────────────────────────────────────────────

export type InsightType = 'warning' | 'opportunity' | 'tip' | 'alert'

export type InsightResult = {
  title: string
  detail: string
  type: InsightType
}

export type InsightInput = {
  currency: string
  // Monthly snapshot
  monthlyIncome: number
  monthlySpent: number
  daysLeftInMonth: number
  // Annual picture
  annualIncome: number
  annualSpent: number
  savingsRate: number
  // Wealth
  netWorth: number
  cashBalance: number
  invested: number
  // Category breakdown (monthly spent vs monthly budget)
  categories: Array<{ name: string; spent: number; budget: number }>
  // Active goals
  goals: Array<{ name: string; current: number; target: number; pct: number }>
  // Over-budget categories
  overBudget: Array<{ name: string; overage: number; pct: number }>
}

export async function getAiInsights(data: InsightInput): Promise<InsightResult[]> {
  const cur = data.currency
  const fmt = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`

  const categoryLines = data.categories
    .filter(c => c.budget > 0 || c.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8)
    .map(c => {
      const pct = c.budget > 0 ? Math.round((c.spent / c.budget) * 100) : null
      return `  • ${c.name}: spent ${fmt(c.spent)}${c.budget > 0 ? ` / budget ${fmt(c.budget)} (${pct}%)` : ' (no budget set)'}`
    }).join('\n')

  const goalLines = data.goals.length > 0
    ? data.goals.slice(0, 5).map(g => `  • ${g.name}: ${fmt(g.current)} / ${fmt(g.target)} (${g.pct}%)`).join('\n')
    : '  • No active goals'

  const cashflowGap = data.monthlyIncome - data.monthlySpent
  const dailyBurn = data.daysLeftInMonth > 0 ? (data.monthlySpent / (30 - data.daysLeftInMonth)) : 0
  const projectedMonthlySpend = dailyBurn * 30

  const prompt = `FINANCIAL DATA — analyse and respond:

MONTHLY CASHFLOW:
  Income:  ${fmt(data.monthlyIncome)}
  Spent:   ${fmt(data.monthlySpent)} (${data.daysLeftInMonth} days remaining)
  Net:     ${cashflowGap >= 0 ? '+' : ''}${fmt(cashflowGap)}
  Daily burn rate: ${fmt(dailyBurn)}/day → projected monthly total: ${fmt(projectedMonthlySpend)}

ANNUAL PICTURE:
  Income: ${fmt(data.annualIncome)} | Spent: ${fmt(data.annualSpent)} | Savings rate: ${data.savingsRate}%

WEALTH SNAPSHOT:
  Net worth: ${fmt(data.netWorth)} (Cash: ${fmt(data.cashBalance)}, Invested: ${fmt(data.invested)})

SPENDING BY CATEGORY (this month):
${categoryLines || '  • No spending recorded'}

SAVINGS GOALS:
${goalLines}

${data.overBudget.length > 0 ? `OVER-BUDGET CATEGORIES:\n${data.overBudget.map(o => `  • ${o.name}: ${fmt(o.overage)} over (${o.pct}% of budget)`).join('\n')}` : ''}

TASK: Produce exactly 5 financial insights. Prioritise the most impactful findings first.
Each insight must:
1. Reference specific numbers from the data above
2. State a clear action the user should take (not just an observation)
3. Assign a type: "warning" (over budget / cashflow risk), "opportunity" (saving or investing upside), "tip" (behavioural habit to adopt), "alert" (urgent action needed)

Respond with a JSON array only — no markdown, no explanation:
[{"title":"short title (5 words max)","detail":"specific actionable insight referencing actual numbers (2 sentences max)","type":"warning|opportunity|tip|alert"},...]`

  const text = await callGemini(ADVISOR_SYSTEM_PROMPT, [{ text: prompt }])
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Could not parse insights — please try again')
  const raw = JSON.parse(match[0]) as InsightResult[]
  return raw.slice(0, 5)
}
