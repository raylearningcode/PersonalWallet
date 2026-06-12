import { useQuery } from '@tanstack/react-query'
import type { Holding } from '@/types'

interface PriceResult {
  price: number
  currency: string
  lastUpdated: number
}

// Cache prices in memory for 15 minutes
const priceCache = new Map<string, PriceResult>()
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

function getCached(ticker: string): PriceResult | null {
  const cached = priceCache.get(ticker)
  if (cached && Date.now() - cached.lastUpdated < CACHE_TTL) return cached
  return null
}

function setCache(ticker: string, price: number, currency: string) {
  priceCache.set(ticker, { price, currency, lastUpdated: Date.now() })
}

// CoinGecko ID map for common crypto tickers
const COINGECKO_IDS: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  ada: 'cardano',
  dot: 'polkadot',
  doge: 'dogecoin',
  xrp: 'ripple',
  avax: 'avalanche-2',
  matic: 'matic-network',
  link: 'chainlink',
  uni: 'uniswap',
  atom: 'cosmos',
  ltc: 'litecoin',
  etc: 'ethereum-classic',
  bch: 'bitcoin-cash',
  usdt: 'tether',
  usdc: 'usd-coin',
  bnb: 'binancecoin',
}

async function fetchCryptoPrice(ticker: string): Promise<{ price: number; currency: string }> {
  const id = COINGECKO_IDS[ticker.toLowerCase()]
  if (!id) throw new Error(`Unknown crypto ticker: ${ticker}`)

  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    { headers: { accept: 'application/json' } }
  )
  if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`)
  const data = await res.json()
  const price = data[id]?.usd
  if (typeof price !== 'number') throw new Error(`No price for ${ticker}`)
  return { price, currency: 'USD' }
}

async function fetchStockPrice(ticker: string): Promise<{ price: number; currency: string }> {
  // Use Yahoo Finance unofficial API (free, no key required)
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`
  )
  if (!res.ok) throw new Error(`Yahoo Finance returned ${res.status}`)
  const data = await res.json()
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta) throw new Error(`No data for ${ticker}`)
  return { price: meta.regularMarketPrice, currency: meta.currency ?? 'USD' }
}

export async function fetchPrice(assetType: string, ticker: string): Promise<{ price: number; currency: string }> {
  const cached = getCached(ticker)
  if (cached) return { price: cached.price, currency: cached.currency }

  let result: { price: number; currency: string }

  if (assetType === 'crypto') {
    result = await fetchCryptoPrice(ticker)
  } else {
    result = await fetchStockPrice(ticker)
  }

  setCache(ticker, result.price, result.currency)
  return result
}

export async function fetchPricesForHoldings(
  holdings: Holding[]
): Promise<Map<string, { price: number; currency: string }>> {
  const results = new Map<string, { price: number; currency: string }>()

  await Promise.allSettled(
    holdings
      .filter(h => h.ticker)
      .map(async holding => {
        const key = holding.ticker
        try {
          // Try cache first
          const cached = getCached(key)
          if (cached) {
            results.set(key, { price: cached.price, currency: cached.currency })
            return
          }
          const result = await fetchPrice(holding.asset_type, key)
          results.set(key, result)
        } catch {
          // If fetch fails, keep last known price from holding record
          if (holding.current_price != null) {
            results.set(key, { price: holding.current_price, currency: holding.currency })
          }
        }
      })
  )

  return results
}

export function useLivePrices(holdings: Holding[]) {
  return useQuery({
    queryKey: ['live_prices', holdings.map(h => `${h.ticker}_${h.asset_type}`).join(',')],
    queryFn: () => fetchPricesForHoldings(holdings),
    enabled: holdings.length > 0 && holdings.some(h => h.ticker),
    staleTime: CACHE_TTL,
    gcTime: CACHE_TTL * 2,
    retry: 1,
  })
}
