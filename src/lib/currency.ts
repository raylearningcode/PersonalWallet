import { useQuery } from '@tanstack/react-query'
import { useAppSettings } from './queries'

export function formatCurrency(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'IDR' ? 0 : 2,
    minimumFractionDigits: currency === 'IDR' ? 0 : 2,
  }).format(amount)
  return formatted.replace('IDR', 'Rp')
}

export function useExchangeRates(baseCurrency: string) {
  return useQuery({
    queryKey: ['exchange_rates', baseCurrency],
    queryFn: async () => {
      const base = baseCurrency.toLowerCase()
      const res = await fetch(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base}.json`
      )
      if (!res.ok) throw new Error('Exchange rate fetch failed')
      const data = (await res.json()) as Record<string, unknown>
      return data[base] as Record<string, number>
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  })
}

export function useCurrency() {
  const { data: settings } = useAppSettings()
  const baseCurrency = settings?.base_currency ?? 'IDR'
  const displayCurrency = settings?.currency ?? 'IDR'
  const { data: rates = {} } = useExchangeRates(baseCurrency)

  return (amount: number) => {
    if (baseCurrency === displayCurrency) {
      return formatCurrency(amount, displayCurrency)
    }
    const rate = rates[displayCurrency.toLowerCase()] ?? 1
    return formatCurrency(amount * rate, displayCurrency)
  }
}
