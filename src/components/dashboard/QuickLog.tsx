import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAddTransaction, useBudgetCategories, useWallets } from '@/lib/queries'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

export function QuickLog() {
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const addTransaction = useAddTransaction()
  const money = useMoney()
  const { data: categories = [] } = useBudgetCategories()
  const { data: wallets = [] } = useWallets()

  const topCategories = useMemo(
    () => (type === 'expense' ? categories.slice(0, 6) : []),
    [categories, type],
  )

  const handleLog = async () => {
    const parsed = parseNumberInput(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    const selectedCat = category || (categories[0]?.name ?? 'General')
    const defaultWallet = wallets[0]?.id ?? null
    await addTransaction.mutateAsync({
      description: type === 'expense' ? selectedCat : 'Income',
      amount: money.toBase(parsed, money.displayCurrency),
      original_amount: parsed,
      original_currency: money.displayCurrency,
      type,
      category: type === 'income' ? 'Wage' : selectedCat,
      wallet_id: defaultWallet,
      transfer_wallet_id: null,
      recurring_rule_id: null,
      recurring_due_date: null,
      date: new Date().toISOString().slice(0, 10),
      needs_review: false,
    })
    toast.success(`${type === 'expense' ? 'Expense' : 'Income'} logged`)
    setAmount('')
    setCategory('')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Quick log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5">
        {/* Type toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setType('expense'); setCategory('') }}
            className={`flex-1 rounded-xl py-2 text-sm font-extrabold transition-colors ${type === 'expense' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`flex-1 rounded-xl py-2 text-sm font-extrabold transition-colors ${type === 'income' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
          >
            Income
          </button>
        </div>

        {/* Amount + Log */}
        <div className="flex gap-2">
          <Input
            className="flex-1 bg-secondary text-base font-extrabold"
            placeholder="Amount"
            value={amount}
            onChange={e => setAmount(formatNumberInput(e.target.value))}
            inputMode="decimal"
          />
          <Button
            onClick={handleLog}
            disabled={addTransaction.isPending}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Log
          </Button>
        </div>

        {/* Category chips (expense only) */}
        {type === 'expense' && topCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {topCategories.map(c => {
              const selected = category === c.name
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(selected ? '' : c.name)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
                    selected
                      ? 'bg-primary/20 text-primary'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {c.color && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                  )}
                  {c.name}
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
