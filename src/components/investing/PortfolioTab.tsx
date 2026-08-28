import { useState, useMemo } from 'react'
import { useHoldings, useAddHolding, useUpdateHolding, useDeleteHolding, useDividends, useAddDividend, useDeleteDividend } from '@/lib/queries'
import { useLivePrices } from '@/lib/priceFetch'
import { useMoney, CURRENCIES, isKnownCurrency } from '@/lib/currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { todayLocal } from '@/lib/utils'
import { AllocationEditor } from './AllocationEditor'
import { RebalancingHelper } from './RebalancingHelper'
import { MoneyField } from '@/components/mobile/MoneyField'
import { toast } from 'sonner'
import { RefreshCw, Plus, Trash2, TrendingDown, TrendingUp, Pencil, HelpCircle } from 'lucide-react'
import type { AssetType, Holding, AllocationItem } from '@/types'

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Stock' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'etf', label: 'ETF' },
  { value: 'bond', label: 'Bond' },
  { value: 'other', label: 'Other' },
]

const ASSET_COLORS: Record<AssetType, string> = {
  stock: '#93C5FD',
  crypto: '#FFD276',
  etf: '#A9F5C7',
  bond: '#C4AEFF',
  other: '#FADBEA',
}

const TICKER_EXAMPLES: Record<AssetType, string> = {
  stock: 'e.g. AAPL, TSLA, 2330.TW, BBCA.JK',
  crypto: 'e.g. BTC, ETH, SOL',
  etf: 'e.g. VTI, SPY, QQQ',
  bond: 'e.g. TLT, BND (or leave empty)',
  other: 'optional — leave empty if no ticker',
}

export function PortfolioTab() {
  const money = useMoney()
  const { data: holdings = [] } = useHoldings()
  const { data: dividends = [] } = useDividends()
  const addHolding = useAddHolding()
  const updateHolding = useUpdateHolding()
  const deleteHolding = useDeleteHolding()
  const addDividend = useAddDividend()
  const deleteDividend = useDeleteDividend()

  const { data: livePrices, refetch: refreshPrices, isFetching: pricesLoading } = useLivePrices(holdings)

  // Add holding form
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addTicker, setAddTicker] = useState('')
  const [addType, setAddType] = useState<AssetType>('stock')
  const [addQty, setAddQty] = useState('')
  const [addPrice, setAddPrice] = useState('')
  const [addDate, setAddDate] = useState(todayLocal)
  const [addCurrency, setAddCurrency] = useState('USD')

  // Edit holding state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editName, setEditName] = useState('')

  // Add dividend form
  const [dividendHolding, setDividendHolding] = useState<string | null>(null)
  const [dividendAmount, setDividendAmount] = useState('')
  const [dividendDate, setDividendDate] = useState(todayLocal)

  // Compute portfolio stats (all values converted to base currency)
  const portfolioStats = useMemo(() => {
    let totalInvestedBase = 0
    let totalCurrentValueBase = 0
    let excludedCount = 0
    const typeTotals: Record<string, number> = {}

    holdings.forEach(h => {
      // Skip holdings whose currency the app cannot convert to base (e.g. HKD/SGD/GBP
      // from Yahoo tickers). Folding their raw value into base-currency totals would
      // silently produce wrong sums; individual rows stay visible in their own currency.
      if (!isKnownCurrency(h.currency)) {
        excludedCount += 1
        return
      }
      // Convert buy price from holding currency to base currency
      const buyPriceBase = money.toBase(h.buy_price, h.currency)
      const investedBase = h.quantity * buyPriceBase
      totalInvestedBase += investedBase

      // Get live price, convert to base
      const livePriceRaw = livePrices?.get(h.ticker)?.price ?? h.current_price ?? h.buy_price
      const livePriceBase = money.toBase(livePriceRaw, h.currency)
      const currentValueBase = h.quantity * livePriceBase
      totalCurrentValueBase += currentValueBase

      typeTotals[h.asset_type] = (typeTotals[h.asset_type] || 0) + currentValueBase
    })

    const allocations: AllocationItem[] = []
    Object.entries(typeTotals).forEach(([type, value]) => {
      if (totalCurrentValueBase > 0 && value > 0) {
        allocations.push({
          name: type.charAt(0).toUpperCase() + type.slice(1),
          pct: Math.round((value / totalCurrentValueBase) * 100),
          color: ASSET_COLORS[type as AssetType] ?? '#6b7280',
        })
      }
    })
    // Normalize percentages to sum to 100
    if (allocations.length > 0) {
      const totalPct = allocations.reduce((s, a) => s + a.pct, 0)
      if (totalPct !== 100 && allocations.length > 0) {
        allocations[0].pct += (100 - totalPct)
      }
    }

    const totalGainBase = totalCurrentValueBase - totalInvestedBase
    const gainPct = totalInvestedBase > 0 ? ((totalCurrentValueBase / totalInvestedBase) - 1) * 100 : 0

    return { totalInvestedBase, totalCurrentValueBase, totalGainBase, gainPct, allocations, excludedCount }
  }, [holdings, livePrices, money.baseCurrency, money.rates])

  const totalDividendsBase = useMemo(
    () => dividends.reduce((sum, d) => sum + d.amount, 0),
    [dividends]
  )

  // --- Handlers ---

  const handleAddHolding = async () => {
    const qty = parseNumberInput(addQty)
    const price = parseNumberInput(addPrice)
    if (!addName.trim() || qty <= 0 || price <= 0) {
      toast.error('Fill in name, quantity, and buy price')
      return
    }
    try {
      await addHolding.mutateAsync({
        name: addName.trim(),
        ticker: addTicker.trim().toUpperCase(),
        asset_type: addType,
        quantity: qty,
        buy_price: price,
        buy_date: addDate,
        currency: addCurrency,
        current_price: null,
      })
      toast.success(`${addName.trim()} added`)
      setAddName(''); setAddTicker(''); setAddQty(''); setAddPrice('')
      setShowAdd(false)
    } catch {
      toast.error('Failed to add holding')
    }
  }

  const startEdit = (h: Holding) => {
    setEditingId(h.id)
    setEditName(h.name)
    setEditQty(formatNumberInput(h.quantity))
    setEditPrice(formatNumberInput(h.buy_price))
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id: string) => {
    const qty = parseNumberInput(editQty)
    const price = parseNumberInput(editPrice)
    if (!editName.trim() || qty <= 0 || price <= 0) {
      toast.error('Invalid values')
      return
    }
    try {
      await updateHolding.mutateAsync({
        id,
        name: editName.trim(),
        quantity: qty,
        buy_price: price,
      })
      toast.success('Holding updated')
      setEditingId(null)
    } catch {
      toast.error('Failed to update holding')
    }
  }

  const handleAddDividend = async () => {
    const amount = parseNumberInput(dividendAmount)
    if (!dividendHolding || amount <= 0) {
      toast.error('Select a holding and enter amount')
      return
    }
    try {
      await addDividend.mutateAsync({
        holding_id: dividendHolding,
        amount,
        date: dividendDate,
      })
      toast.success('Dividend logged')
      setDividendAmount(''); setDividendHolding(null)
    } catch {
      toast.error('Failed to log dividend')
    }
  }

  const handleRefreshPrices = async () => {
    if (holdings.length === 0) { toast.error('No holdings to refresh'); return }
    try {
      const result = await refreshPrices()
      let ok = 0
      let n = 0
      let failures = 0
      if (result.data) {
        for (const h of holdings) {
          const fetched = result.data.get(h.ticker)
          if (fetched && h.current_price !== fetched.price) {
            n += 1
            try {
              // Store the raw fetched price in the holding's currency
              await updateHolding.mutateAsync({ id: h.id, current_price: fetched.price })
              ok += 1
            } catch {
              failures += 1
            }
          }
        }
      }
      if (n === 0) {
        toast.success('Prices already up to date')
      } else {
        toast.success(`Updated ${ok} of ${n} prices${failures ? ` — ${failures} failed` : ''}`)
      }
    } catch {
      toast.error('Failed to fetch some prices — check ticker symbols')
    }
  }

  return (
    <div className="space-y-6">
      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Portfolio value</p>
          <p className="mt-1 text-xl font-extrabold text-foreground">
            {money.formatDisplay(portfolioStats.totalCurrentValueBase)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total invested</p>
          <p className="mt-1 text-xl font-extrabold text-foreground">
            {money.formatDisplay(portfolioStats.totalInvestedBase)}
          </p>
        </div>
        <div className={`rounded-2xl border p-4 ${portfolioStats.totalGainBase >= 0 ? 'border-primary/30 bg-primary/5' : 'border-destructive/30 bg-destructive/5'}`}>
          <p className="text-xs text-muted-foreground">Total gain/loss</p>
          <div className="mt-1 flex items-center gap-2">
            <p className={`text-xl font-extrabold ${portfolioStats.totalGainBase >= 0 ? 'text-primary' : 'text-destructive'}`}>
              {money.formatDisplay(Math.abs(portfolioStats.totalGainBase))}
            </p>
            {portfolioStats.totalGainBase >= 0
              ? <TrendingUp className="h-4 w-4 text-primary" />
              : <TrendingDown className="h-4 w-4 text-destructive" />
            }
          </div>
          <p className={`text-xs font-bold ${portfolioStats.gainPct >= 0 ? 'text-primary' : 'text-destructive'}`}>
            {portfolioStats.gainPct >= 0 ? '+' : ''}{portfolioStats.gainPct.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Dividends received</p>
          <p className="mt-1 text-xl font-extrabold text-foreground">
            {money.formatDisplay(totalDividendsBase)}
          </p>
        </div>
      </div>

      {portfolioStats.excludedCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {portfolioStats.excludedCount} holding{portfolioStats.excludedCount === 1 ? '' : 's'} with unsupported currency excluded from totals
        </p>
      )}

      {/* Holdings + Allocation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Holdings List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-xl">Holdings</CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="secondary" size="sm" className="h-8 px-3 text-xs"
                  onClick={handleRefreshPrices}
                  disabled={pricesLoading || holdings.length === 0}
                >
                  <RefreshCw className={`mr-1.5 h-3 w-3 ${pricesLoading ? 'animate-spin' : ''}`} />
                  {pricesLoading ? 'Fetching…' : 'Refresh prices'}
                </Button>
                <Button size="sm" className="h-8 px-3 text-xs" onClick={() => { setShowAdd(true); setEditingId(null) }}>
                  <Plus className="mr-1 h-3 w-3" /> Add
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-6 sm:px-8">
            {holdings.length === 0 && !showAdd ? (
              <div className="py-10 text-center">
                <p className="font-extrabold text-foreground">No holdings yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add stocks, crypto, ETFs, or bonds to track your real portfolio.</p>
                <Button className="mt-4" size="sm" onClick={() => setShowAdd(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add your first holding
                </Button>
              </div>
            ) : (
              <>
                {/* Add holding inline form */}
                {showAdd && (
                  <div className="rounded-xl border border-primary/30 bg-secondary p-4 space-y-3">
                    <p className="text-sm font-bold text-foreground">Add holding</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <Label className="text-xs text-muted-foreground">Name</Label>
                        <Input aria-label="Holding name" className="mt-1 h-9 rounded-lg bg-card text-sm" placeholder="Apple Inc." value={addName} onChange={e => setAddName(e.target.value)} />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <Label className="text-xs text-muted-foreground">Ticker symbol</Label>
                        <Input aria-label="Ticker symbol" className="mt-1 h-9 rounded-lg bg-card text-sm font-mono" placeholder={TICKER_EXAMPLES[addType]} value={addTicker} onChange={e => setAddTicker(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Type</Label>
                        <select aria-label="Asset type" className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm font-bold text-foreground outline-none" value={addType} onChange={e => { setAddType(e.target.value as AssetType); setAddTicker('') }}>
                          {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Currency</Label>
                        <select aria-label="Currency" className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm font-bold text-foreground outline-none" value={addCurrency} onChange={e => setAddCurrency(e.target.value)}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Quantity</Label>
                        <Input aria-label="Quantity" className="mt-1 h-9 rounded-lg bg-card text-sm" inputMode="decimal" placeholder="10" value={addQty} onChange={e => setAddQty(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Buy price (per unit in {addCurrency})</Label>
                        <MoneyField ariaLabel="Buy price" className="mt-1 h-9 rounded-lg bg-card text-sm" placeholder="150" value={addPrice} currency={addCurrency} onChange={v => setAddPrice(v)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Buy date</Label>
                        <Input aria-label="Buy date" type="date" className="mt-1 h-9 rounded-lg bg-card text-sm" value={addDate} onChange={e => setAddDate(e.target.value)} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="h-8 flex-1 text-xs" onClick={handleAddHolding} disabled={addHolding.isPending}>
                        {addHolding.isPending ? 'Adding…' : 'Add holding'}
                      </Button>
                      <Button variant="secondary" className="h-8 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {/* Holdings rows */}
                {holdings.map(h => {
                  const isEditing = editingId === h.id
                  const currencyKnown = isKnownCurrency(h.currency)
                  // Live price in holding's currency → convert to base for display
                  const livePriceRaw = livePrices?.get(h.ticker)
                  const currentPriceRaw = livePriceRaw?.price ?? h.current_price ?? h.buy_price
                  const currentPriceBase = money.toBase(currentPriceRaw, h.currency)
                  const buyPriceBase = money.toBase(h.buy_price, h.currency)
                  const currentValueBase = h.quantity * currentPriceBase
                  const investedBase = h.quantity * buyPriceBase
                  const gainBase = currentValueBase - investedBase
                  const gainPct = investedBase > 0 ? ((currentValueBase / investedBase) - 1) * 100 : 0
                  const holdingDividends = dividends.filter(d => d.holding_id === h.id).reduce((sum, d) => sum + d.amount, 0)
                  // Unknown currencies can't convert to base — show values in the holding's own currency
                  const fmtValue = (v: number) => currencyKnown ? money.formatDisplay(v) : money.format(v, h.currency)

                  if (isEditing) {
                    return (
                      <div key={h.id} className="rounded-xl border border-primary/30 bg-secondary p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-foreground">Edit {h.name}</p>
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 px-3 text-xs" onClick={() => saveEdit(h.id)} disabled={updateHolding.isPending}>
                              ✓ Save
                            </Button>
                            <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={cancelEdit}>
                              ✕ Cancel
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Name</Label>
                            <Input className="mt-0.5 h-8 rounded-lg bg-card text-xs" value={editName} onChange={e => setEditName(e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Ticker</Label>
                            <Input className="mt-0.5 h-8 rounded-lg bg-card text-xs font-mono" value={h.ticker} disabled />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Quantity</Label>
                            <Input className="mt-0.5 h-8 rounded-lg bg-card text-xs" inputMode="decimal" value={editQty} onChange={e => setEditQty(e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Buy price ({h.currency})</Label>
                            <MoneyField ariaLabel="Edit buy price" className="mt-0.5 h-8 rounded-lg bg-card text-xs" value={editPrice} currency={h.currency} onChange={v => setEditPrice(v)} />
                          </div>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={h.id} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: ASSET_COLORS[h.asset_type] }} />
                            <p className="font-extrabold text-foreground truncate">{h.name}</p>
                            {h.ticker && <span className="text-xs font-bold text-muted-foreground font-mono">{h.ticker}</span>}
                            <span className="text-xs text-muted-foreground">· {h.currency}</span>
                            {!currencyKnown && (
                              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">currency unsupported</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {h.quantity} units × {money.format(h.buy_price, h.currency)}/unit · bought {h.buy_date}
                          </p>
                          {livePriceRaw && (
                            <p className="text-xs text-primary">
                              Live: {money.format(currentPriceRaw, livePriceRaw.currency)}
                              {livePriceRaw.currency !== h.currency && ` (holding: ${h.currency})`}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => startEdit(h)}
                            aria-label={`Edit ${h.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-xs text-destructive hover:text-red-300"
                            onClick={() => { if (window.confirm(`Delete ${h.name}?`)) deleteHolding.mutate(h.id) }}
                            aria-label={`Delete ${h.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-lg bg-secondary px-3 py-2">
                          <p className="text-[10px] text-muted-foreground">Current value</p>
                          <p className="text-sm font-extrabold text-foreground">
                            {fmtValue(currentValueBase)}
                          </p>
                          {h.currency !== money.baseCurrency && (
                            <p className="text-[10px] text-muted-foreground">≈ {money.format(currentPriceRaw * h.quantity, h.currency)}</p>
                          )}
                        </div>
                        <div className={`rounded-lg px-3 py-2 ${gainBase >= 0 ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                          <p className="text-[10px] text-muted-foreground">Gain/Loss</p>
                          <p className={`text-sm font-extrabold ${gainBase >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {gainBase >= 0 ? '+' : ''}{fmtValue(Math.abs(gainBase))}
                          </p>
                          <p className={`text-[10px] font-bold ${gainPct >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%
                          </p>
                        </div>
                        <div className="rounded-lg bg-secondary px-3 py-2">
                          <p className="text-[10px] text-muted-foreground">Dividends</p>
                          <p className="text-sm font-extrabold text-foreground">
                            {money.formatDisplay(holdingDividends)}
                          </p>
                        </div>
                      </div>

                      {/* Log dividend */}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          className="text-xs font-bold text-primary hover:underline"
                          onClick={() => {
                            setDividendHolding(dividendHolding === h.id ? null : h.id)
                            setDividendAmount('')
                            setDividendDate(todayLocal())
                          }}
                        >
                          {dividendHolding === h.id ? 'Cancel' : '+ Log dividend'}
                        </button>
                        <span title="Dividends are logged manually. Stock dividend APIs require paid subscriptions.">
                          <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                        </span>
                      </div>

                      {dividendHolding === h.id && (
                        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg border border-border bg-secondary p-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Amount</Label>
                            <MoneyField ariaLabel="Dividend amount" className="mt-0.5 h-8 rounded-lg bg-card text-xs" placeholder="0"
                              value={dividendAmount} currency={money.displayCurrency} onChange={v => setDividendAmount(v)} />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Date</Label>
                            <Input aria-label="Dividend date" type="date" className="mt-0.5 h-8 rounded-lg bg-card text-xs"
                              value={dividendDate} onChange={e => setDividendDate(e.target.value)} />
                          </div>
                          <Button size="sm" className="h-8 px-3 text-xs" onClick={handleAddDividend} disabled={addDividend.isPending}>
                            Save
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </CardContent>
        </Card>

        {/* Rebalancing Helper */}
        {portfolioStats.totalCurrentValueBase > 0 && (
          <RebalancingHelper
            allocations={portfolioStats.allocations}
            totalValue={portfolioStats.totalCurrentValueBase}
          />
        )}

        {/* Portfolio Allocation (read-only, auto-generated) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Allocation</CardTitle>
            <p className="text-xs text-muted-foreground">Auto-generated from your actual holdings by asset type.</p>
          </CardHeader>
          <CardContent className="px-5 pb-6">
            {portfolioStats.totalCurrentValueBase > 0 ? (
              <AllocationEditor
                value={portfolioStats.allocations}
                onChange={() => {}}
                onSave={() => {}}
                isSaving={false}
                readOnly
              />
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">Add holdings to see your allocation breakdown.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dividend History */}
      {dividends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Dividend history</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-6 sm:px-8">
            <div className="space-y-2">
              {dividends.slice(0, 20).map(d => {
                const holding = holdings.find(h => h.id === d.holding_id)
                return (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5">
                    <div>
                      <p className="text-sm font-bold text-foreground">{holding?.name ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{d.date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-extrabold text-primary">{money.formatDisplay(d.amount)}</span>
                      <button
                        className="text-xs text-destructive hover:text-red-300"
                        onClick={() => deleteDividend.mutate(d.id)}
                        aria-label="Delete dividend"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
