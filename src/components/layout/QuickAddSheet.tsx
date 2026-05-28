import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useAddTransaction, useBudgetCategories, useWallets } from '@/lib/queries'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { toast } from 'sonner'

const INCOME_CATEGORIES = ['Wage', 'Gift', 'Refund', 'Allowance', 'Other income']

type QuickType = 'expense' | 'income' | 'transfer'

export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const money = useMoney()
  const { data: categories = [] } = useBudgetCategories()
  const { data: wallets = [] } = useWallets()
  const addTransaction = useAddTransaction()

  const [type, setType] = useState<QuickType>('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [walletId, setWalletId] = useState('')
  const [transferWalletId, setTransferWalletId] = useState('')

  useEffect(() => {
    if (wallets.length > 0 && !walletId) setWalletId(wallets[0].id)
    if (wallets.length > 1 && !transferWalletId) setTransferWalletId(wallets[1].id)
  }, [wallets, walletId, transferWalletId])

  useEffect(() => {
    if (type === 'income') setCategory(INCOME_CATEGORIES[0])
    else setCategory(categories[0]?.name ?? '')
  }, [type, categories])

  const reset = () => {
    setAmount('')
    setType('expense')
    setCategory(categories[0]?.name ?? '')
    setWalletId(wallets[0]?.id ?? '')
    setTransferWalletId(wallets[1]?.id ?? '')
  }

  const handleSave = async () => {
    const parsed = parseNumberInput(amount)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    if (type !== 'transfer' && !category) return
    if (!walletId) return
    if (type === 'transfer' && (!transferWalletId || walletId === transferWalletId)) return

    const baseAmount = money.toBase(parsed, money.displayCurrency)
    const label = type === 'transfer' ? 'Transfer' : category

    await addTransaction.mutateAsync({
      description: label,
      amount: baseAmount,
      original_amount: parsed,
      original_currency: money.displayCurrency,
      type,
      category: label,
      wallet_id: walletId,
      transfer_wallet_id: type === 'transfer' ? transferWalletId : null,
      recurring_rule_id: null,
      recurring_due_date: null,
      date: new Date().toISOString().slice(0, 10),
      needs_review: false,
    })

    toast.success('Transaction added')
    reset()
    onClose()
  }

  const displayCategories = type === 'income' ? INCOME_CATEGORIES : categories.map(c => c.name)

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="bottom" className="rounded-t-3xl border-border bg-background pb-10">
        <SheetHeader className="mb-5 text-left">
          <SheetTitle>Quick add</SheetTitle>
        </SheetHeader>

        <div className="mb-5 inline-flex w-full rounded-full border border-border bg-secondary p-1">
          {(['expense', 'income', 'transfer'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded-full py-2.5 text-sm font-extrabold capitalize transition-colors ${
                type === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mb-5 flex items-center justify-center gap-3 rounded-2xl border border-border bg-secondary px-5 py-5">
          <span className="text-sm font-bold text-muted-foreground">{money.displayCurrency}</span>
          <input
            aria-label="Amount"
            className="w-full bg-transparent text-center text-4xl font-extrabold text-foreground outline-none placeholder:text-muted-foreground/40"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(formatNumberInput(e.target.value))}
            placeholder="0"
          />
        </div>

        {type !== 'transfer' && displayCategories.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-xs font-bold text-muted-foreground">Category</p>
            <div className="grid grid-cols-3 gap-2">
              {displayCategories.slice(0, 6).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${
                    category === cat
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {type === 'transfer' && wallets.length >= 2 && (
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div>
              <p className="mb-2 text-xs font-bold text-muted-foreground">From</p>
              <div className="flex flex-col gap-1.5">
                {wallets.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWalletId(w.id)}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                      walletId === w.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-secondary text-muted-foreground'
                    }`}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-muted-foreground">To</p>
              <div className="flex flex-col gap-1.5">
                {wallets.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setTransferWalletId(w.id)}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                      transferWalletId === w.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-secondary text-muted-foreground'
                    }`}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {type !== 'transfer' && wallets.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-xs font-bold text-muted-foreground">Wallet</p>
            <div className="flex flex-wrap gap-2">
              {wallets.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWalletId(w.id)}
                  className={`rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
                    walletId === w.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-secondary text-muted-foreground'
                  }`}
                >
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button
          className="h-12 w-full text-base font-extrabold capitalize"
          onClick={handleSave}
          disabled={
            addTransaction.isPending ||
            !amount ||
            wallets.length === 0 ||
            (type === 'transfer' && (wallets.length < 2 || walletId === transferWalletId))
          }
        >
          Save {type}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
