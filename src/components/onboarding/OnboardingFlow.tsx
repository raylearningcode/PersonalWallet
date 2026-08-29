import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAddWallet, useAddTransaction, useWallets, useBudgetCategories, useAddBudgetCategory } from '@/lib/queries'
import { useMoney } from '@/lib/currency'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'
import { todayLocal } from '@/lib/utils'
import { MoneyField } from '@/components/mobile/MoneyField'
import { DEFAULT_BUDGET_CATEGORIES } from '@/lib/categories'
import { toast } from 'sonner'
import { Wallet, ReceiptText, LayoutDashboard, ArrowRight, Check, Loader2 } from 'lucide-react'

const ONBOARDING_KEY = 'finpath_onboarding_complete'

export function isOnboardingDone() {
  return localStorage.getItem(ONBOARDING_KEY) === '1'
}

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1)
  const money = useMoney()
  const addWallet = useAddWallet()
  const addTransaction = useAddTransaction()
  const addCategory = useAddBudgetCategory()
  const { data: wallets = [] } = useWallets()
  const { data: categories = [] } = useBudgetCategories()

  // Auto-seed a default Cash wallet + all starter categories on first run,
  // so new users can start immediately without any setup.
  const [seeding, setSeeding] = useState(true)
  const [seedError, setSeedError] = useState(false)
  const seededRef = useRef(false)

  useEffect(() => {
    if (seededRef.current) return
    const needWallet = wallets.length === 0
    const needCategories = categories.length === 0
    if (!needWallet && !needCategories) { setSeeding(false); return }
    if (seedError) { setSeeding(false); return }
    seededRef.current = true
    ;(async () => {
      try {
        if (needWallet) {
          await addWallet.mutateAsync({
            name: 'Cash',
            type: 'cash',
            currency: money.displayCurrency,
            balance: 0,
            cash_role: 'mixed',
          })
        }
        if (needCategories) {
          for (const c of DEFAULT_BUDGET_CATEGORIES) {
            await addCategory.mutateAsync({
              name: c.name,
              yearly_allocated: c.yearly_allocated,
              budget_period: c.budget_period,
              color: c.color,
            })
          }
        }
        setSeeding(false)
      } catch {
        setSeedError(true)
        setSeeding(false)
      }
    })()
  }, [wallets.length, categories.length, seedError])

  // Step 1 state
  const [walletName, setWalletName] = useState('Cash')
  const [walletType, setWalletType] = useState<'cash' | 'bank' | 'card' | 'e_wallet'>('cash')
  const [walletBalance, setWalletBalance] = useState('')

  // Step 2 state
  const [txType, setTxType] = useState<'expense' | 'income'>('expense')
  const [txAmount, setTxAmount] = useState('')
  const [txCategory, setTxCategory] = useState('')

  const handleSkip = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    onComplete()
  }

  const handleCreateWallet = async () => {
    if (!walletName.trim()) { toast.error('Enter a wallet name'); return }
    const balance = parseNumberInput(walletBalance)
    try {
      await addWallet.mutateAsync({
        name: walletName.trim(),
        type: walletType,
        currency: money.displayCurrency,
        balance: Number.isFinite(balance) ? money.toBase(balance, money.displayCurrency) : 0,
        cash_role: walletType === 'cash' ? 'mixed' : null,
      })
    } catch {
      toast.error('Setup step failed — please try again')
      return
    }
    toast.success('Wallet created')
    setStep(2)
  }

  const handleLogTransaction = async () => {
    const parsed = parseNumberInput(txAmount)
    if (!Number.isFinite(parsed) || parsed <= 0) { toast.error('Enter a valid amount'); return }
    const walletToUse = wallets[0]
    if (!walletToUse) { toast.error('Create a wallet first'); return }
    const cat = txCategory || categories[0]?.name || 'General'
    try {
      await addTransaction.mutateAsync({
        description: txType === 'expense' ? cat : 'My first income',
        amount: money.toBase(parsed, money.displayCurrency),
        original_amount: parsed,
        original_currency: money.displayCurrency,
        type: txType,
        category: txType === 'income' ? 'Wage' : cat,
        wallet_id: walletToUse.id,
        transfer_wallet_id: null,
        recurring_rule_id: null,
        recurring_due_date: null,
        date: todayLocal(),
        needs_review: false,
      })
    } catch {
      toast.error('Setup step failed — please try again')
      return
    }
    toast.success('Transaction logged')
    setStep(3)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        {/* Step 1: Auto-setup (seeds Cash wallet + starter categories) */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-extrabold text-primary">1</span>
              <span className="text-xs font-bold text-muted-foreground">of 3</span>
            </div>
            <h2 className="text-xl font-extrabold text-foreground">{seeding ? 'Setting things up…' : 'Everything is ready'}</h2>
            <p className="text-sm text-muted-foreground">We've prepared your starting wallet and budget categories — no setup needed.</p>
            {seeding ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary p-3">
                  <Check className="h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-extrabold text-foreground">Cash wallet created</p>
                    <p className="text-xs text-muted-foreground">One simple wallet to start — add more anytime in Settings</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary p-3">
                  <Check className="h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-extrabold text-foreground">{DEFAULT_BUDGET_CATEGORIES.length} starter categories added</p>
                    <p className="text-xs text-muted-foreground">Food, Transport, Housing, Balancing and more — set budgets whenever you're ready</p>
                  </div>
                </div>
              </div>
            )}
            {seedError ? (
              <>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-bold">Name</Label>
                    <Input className="mt-1.5 bg-secondary" value={walletName} onChange={e => setWalletName(e.target.value)} placeholder="e.g. Cash, BCA, GoPay" />
                  </div>
                  <div>
                    <Label className="text-sm font-bold">Type</Label>
                    <div className="mt-1.5 grid grid-cols-4 gap-2">
                      {(['cash', 'bank', 'card', 'e_wallet'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setWalletType(t)}
                          className={`rounded-xl border py-2 text-xs font-bold capitalize transition-colors ${walletType === t ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-secondary text-muted-foreground'}`}
                        >
                          {t.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-bold">Starting balance (optional)</Label>
                    <MoneyField ariaLabel="Starting balance" className="mt-1.5 bg-secondary" value={walletBalance} currency={money.displayCurrency} onChange={v => setWalletBalance(formatNumberInput(v))} placeholder="0" />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleCreateWallet} disabled={addWallet.isPending} className="flex-1 gap-2">
                    <Wallet className="h-4 w-4" /> Create wallet
                  </Button>
                  <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">Skip</Button>
                </div>
              </>
            ) : !seeding ? (
              <div className="flex gap-2 pt-2">
                <Button onClick={() => setStep(2)} className="flex-1 gap-2">
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">Skip</Button>
              </div>
            ) : null}
          </div>
        )}

        {/* Step 2: First transaction */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-extrabold text-primary">2</span>
              <span className="text-xs font-bold text-muted-foreground">of 3</span>
            </div>
            <h2 className="text-xl font-extrabold text-foreground">Log your first transaction</h2>
            <p className="text-sm text-muted-foreground">This is how you'll track daily spending. Quick and simple.</p>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTxType('expense')}
                  className={`flex-1 rounded-xl py-2 text-sm font-extrabold transition-colors ${txType === 'expense' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('income')}
                  className={`flex-1 rounded-xl py-2 text-sm font-extrabold transition-colors ${txType === 'income' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                >
                  Income
                </button>
              </div>
              <MoneyField ariaLabel="Transaction amount" className="bg-secondary text-center text-2xl font-extrabold" value={txAmount} currency={money.displayCurrency} onChange={v => setTxAmount(formatNumberInput(v))} placeholder="0" />
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {categories.slice(0, 6).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setTxCategory(c.name === txCategory ? '' : c.name)}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${txCategory === c.name ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleLogTransaction} disabled={addTransaction.isPending} className="flex-1 gap-2">
                <ReceiptText className="h-4 w-4" /> Log it
              </Button>
              <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">Skip</Button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-extrabold text-foreground">You're all set!</h2>
            <p className="text-sm text-muted-foreground">Here's what to do next:</p>
            <div className="space-y-2 text-left">
              {[
                { icon: LayoutDashboard, label: 'Dashboard', desc: 'Your financial snapshot — net worth, spending, and goals at a glance' },
                { icon: ReceiptText, label: 'Transactions', desc: 'Browse, search, and manage all your transactions with filters and bulk actions' },
                { icon: Wallet, label: 'Budget', desc: 'Set category budgets to track where your money goes each month' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 rounded-xl border border-border bg-secondary p-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-extrabold text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={handleSkip} className="w-full gap-2">
              <ArrowRight className="h-4 w-4" /> Get started
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
