import { useQuery } from '@tanstack/react-query'
import { useAppSettings } from './queries'

export const CURRENCIES = ['USD', 'IDR', 'TWD', 'EUR', 'JPY'] as const

type Rates = Record<string, number>

const KNOWN_CODES = new Set(CURRENCIES.map(c => c.toLowerCase()))

// True for codes the app can actually convert — CURRENCIES and the fallback
// rates table define exactly the same set. Values stored in any other code
// (e.g. HKD/SGD/GBP from Yahoo tickers) cannot be converted to base currency;
// callers building base-currency totals must exclude them rather than
// surfacing raw amounts as if they were base.
export function isKnownCurrency(code: string): boolean {
  return KNOWN_CODES.has(code.toLowerCase())
}

const FALLBACK_USD_RATES: Rates = {
  usd: 1,
  idr: 16320,
  twd: 29.672727,
  eur: 0.92,
  jpy: 157,
}

export function formatCurrency(amount: number, currency: string): string {
  // Validate the code before Intl.NumberFormat — unknown/legacy codes would otherwise
  // either throw (non-ISO codes) or silently mis-render; fall back to the raw value.
  if (!KNOWN_CODES.has(currency.toLowerCase())) {
    return `${amount} ${currency}`
  }
  const isWhole = Number.isInteger(amount)
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
    minimumFractionDigits: currency === 'IDR' ? 0 : isWhole ? 0 : 2,
  }).format(amount)
  // Normalize any non-breaking spaces from Intl output, then replace IDR prefix
  return formatted.replace(/ | /g, ' ').replace('IDR', 'Rp')
}

export function getFallbackRates(baseCurrency: string): Rates {
  const base = baseCurrency.toLowerCase()
  const basePerUsd = FALLBACK_USD_RATES[base] ?? 1
  return Object.fromEntries(
    Object.entries(FALLBACK_USD_RATES).map(([currency, perUsd]) => [currency, perUsd / basePerUsd])
  )
}

export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string, rates: Rates): number | null {
  if (fromCurrency === toCurrency) return amount
  const from = fromCurrency.toLowerCase()
  const to = toCurrency.toLowerCase()
  // Unknown codes must not silently fall back to 1:1 math — signal the caller instead.
  if (!KNOWN_CODES.has(from) || !KNOWN_CODES.has(to)) return null
  const fromRate = rates[from] ?? getFallbackRates(toCurrency)[from] ?? 1
  const toRate = rates[to] ?? getFallbackRates(fromCurrency)[to] ?? 1

  if (fromRate === 0) return amount
  return amount / fromRate * toRate
}

type RatesResponse = { rates: Rates; date: string | null }

export function useExchangeRates(baseCurrency: string) {
  return useQuery<RatesResponse>({
    queryKey: ['exchange_rates', baseCurrency],
    queryFn: async () => {
      const base = baseCurrency.toLowerCase()
      const res = await fetch(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base}.json`
      )
      if (!res.ok) throw new Error('Exchange rate fetch failed')
      const data = (await res.json()) as Record<string, unknown>
      const date = typeof data.date === 'string' ? data.date : null
      const rates = { ...getFallbackRates(baseCurrency), ...(data[base] as Record<string, number>) }
      return { rates, date }
    },
    placeholderData: { rates: getFallbackRates(baseCurrency), date: null },
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: true,
    retry: 2,
  })
}

export function useMoney() {
  const { data: settings } = useAppSettings()
  // Prefer whichever field is non-IDR — IDR was the old system default so a non-IDR
  // value in either field reflects deliberate user intent. base_currency takes priority.
  const rawBase = settings?.base_currency ?? 'IDR'
  const rawView = settings?.currency ?? 'IDR'
  const baseCurrency = rawBase !== 'IDR' ? rawBase : rawView
  const displayCurrency = baseCurrency
  const { data: ratesData } = useExchangeRates(baseCurrency)
  const rates = ratesData?.rates ?? getFallbackRates(baseCurrency)
  const ratesDate = ratesData?.date ?? null

  const fromBase = (amount: number, currency = displayCurrency): number => {
    const converted = convertCurrency(amount, baseCurrency, currency, rates)
    if (converted === null) {
      console.warn(`[currency] Unknown currency "${currency}" — skipping conversion, showing raw amount`)
      return amount
    }
    return converted
  }
  const toBase = (amount: number, currency = displayCurrency): number => {
    const converted = convertCurrency(amount, currency, baseCurrency, rates)
    if (converted === null) {
      console.warn(`[currency] Unknown currency "${currency}" — skipping conversion, showing raw amount`)
      return amount
    }
    return converted
  }

  return {
    baseCurrency,
    displayCurrency,
    rates,
    ratesDate,
    toBase,
    fromBase,
    format: (amount: number, currency = displayCurrency) => formatCurrency(amount, currency),
    formatBase: (amount: number) => formatCurrency(amount, baseCurrency),
    // Always show in baseCurrency (main) — no live-rate conversion, no drift
    formatDisplay: (baseAmount: number) => formatCurrency(baseAmount, baseCurrency),
    approxBase: (amount: number, currency = displayCurrency) => formatCurrency(toBase(amount, currency), baseCurrency),
    // Uses original_amount when original_currency matches main currency — exact, never drifts
    formatTx: (tx: { amount: number; original_amount?: number | null; original_currency?: string | null }) =>
      formatCurrency(
        tx.original_currency === baseCurrency && tx.original_amount != null ? tx.original_amount : tx.amount,
        baseCurrency
      ),
    // Secondary currency reference — converts base amount to displayCurrency for reference display
    // Returns null when base === display (no secondary reference needed)
    formatRef: (baseAmount: number): string | null =>
      baseCurrency !== displayCurrency
        ? formatCurrency(fromBase(baseAmount, displayCurrency), displayCurrency)
        : null,
  }
}

export function txAmountColor(amount: number, type: string): string {
  if (amount === 0) return 'text-foreground'
  if (type === 'income') return 'text-primary'
  if (type === 'transfer') return 'text-muted-foreground'
  return 'text-[#FF8388]'
}

export function txAmountSign(amount: number, type: string): string {
  if (amount === 0) return ''
  if (type === 'income') return '+'
  if (type === 'transfer') return ''
  return '-'
}
