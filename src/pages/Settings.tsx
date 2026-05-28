import { useEffect, useMemo, useState } from 'react'
import {
  useAppSettings, useSaveAppSettings,
  useBudgetCategories, useAddBudgetCategory, useDeleteBudgetCategory,
  useBudgetRules, useAddBudgetRule,
  useAuthSession, useSignIn, useSignUp, useSignOut,
  useWallets, useAddWallet, useDeleteWallet,
  useTransactions, useAddTransaction,
  useInvestmentConfig, useSaveInvestmentConfig,
  useEstimationPlans, useUpsertEstimationPlan,
} from '@/lib/queries'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DEFAULT_BUDGET_CATEGORIES } from '@/lib/categories'
import { useMoney } from '@/lib/currency'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import type { Wallet } from '@/types'

const CURRENCIES = ['USD', 'IDR', 'TWD', 'EUR', 'JPY']

const WALLET_TYPE_LABELS: Record<string, string> = {
  cash: 'Cash', bank: 'Bank', card: 'Card',
  e_wallet: 'E-wallet', investment: 'Investment', other: 'Other',
}
const WALLET_TYPE_ORDER = ['cash', 'bank', 'card', 'e_wallet', 'investment', 'other']

export function Settings() {
  const money = useMoney()
  const { data: settings } = useAppSettings()
  const { data: session } = useAuthSession()
  const saveSettings = useSaveAppSettings()
  const signIn = useSignIn()
  const signUp = useSignUp()
  const signOut = useSignOut()
  const { data: categories = [] } = useBudgetCategories()
  const addCategory = useAddBudgetCategory()
  const deleteCategory = useDeleteBudgetCategory()
  const { data: wallets = [] } = useWallets()
  const { data: transactions = [] } = useTransactions()
  const { data: budgetRules = [] } = useBudgetRules()
  const { data: investmentConfig } = useInvestmentConfig()
  const { data: estimationPlans = [] } = useEstimationPlans()
  const addWallet = useAddWallet()
  const deleteWallet = useDeleteWallet()
  const addTransaction = useAddTransaction()
  const addBudgetRule = useAddBudgetRule()
  const saveInvestmentConfig = useSaveInvestmentConfig()
  const upsertEstimationPlan = useUpsertEstimationPlan()

  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('IDR')
  const [currency, setCurrency] = useState('IDR')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [walletName, setWalletName] = useState('')
  const [walletType, setWalletType] = useState<Wallet['type']>('cash')
  const [backupText, setBackupText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<null | {
    kind: 'category' | 'wallet'
    id: string
    name: string
  }>(null)
  const walletBalances = useMemo(() => {
    const map = new Map(wallets.map(wallet => [wallet.id, wallet.balance ?? 0]))
    transactions.forEach(tx => {
      if (tx.type === 'income' && tx.wallet_id) map.set(tx.wallet_id, (map.get(tx.wallet_id) ?? 0) + tx.amount)
      if (tx.type !== 'income' && tx.type !== 'transfer' && tx.wallet_id) map.set(tx.wallet_id, (map.get(tx.wallet_id) ?? 0) - tx.amount)
      if (tx.type === 'transfer') {
        if (tx.wallet_id) map.set(tx.wallet_id, (map.get(tx.wallet_id) ?? 0) - tx.amount)
        if (tx.transfer_wallet_id) map.set(tx.transfer_wallet_id, (map.get(tx.transfer_wallet_id) ?? 0) + tx.amount)
      }
    })
    return map
  }, [transactions, wallets])

  const walletGroups = useMemo(() => {
    const groups: Record<string, typeof wallets> = {}
    for (const wallet of wallets) {
      const key = wallet.type ?? 'other'
      if (!groups[key]) groups[key] = []
      groups[key].push(wallet)
    }
    return WALLET_TYPE_ORDER.filter(t => groups[t]?.length > 0).map(t => ({ type: t, wallets: groups[t] }))
  }, [wallets])

  useEffect(() => {
    setName(settings?.user_name ?? '')
    setBaseCurrency(settings?.base_currency || 'IDR')
    setCurrency(settings?.currency || 'IDR')
  }, [settings, session])

  const baseSettings = {
    id: settings?.id,
    user_name: name,
    email: session?.user.email || '',
    theme: settings?.theme ?? 'dark',
    base_currency: baseCurrency,
    currency,
    year_start: settings?.year_start ?? '',
    default_view: settings?.default_view ?? '',
    notifications: settings?.notifications ?? '',
    annual_goal_label: settings?.annual_goal_label ?? '',
    annual_goal_pct: settings?.annual_goal_pct ?? 0,
  }

  const saveProfile = async () => {
    await saveSettings.mutateAsync(baseSettings)
    setEditMode(false)
    toast.success('Profile updated')
  }

  const saveCurrency = async () => {
    await saveSettings.mutateAsync(baseSettings)
    toast.success('Currency saved')
  }

  const handleSignIn = async () => {
    await signIn.mutateAsync({ email: authEmail, password: authPassword })
    toast.success('Logged in')
  }

  const handleSignUp = async () => {
    await signUp.mutateAsync({ email: authEmail, password: authPassword })
    toast.success('Signup started. Check your email if confirmation is enabled.')
  }

  const handleAddCategory = async () => {
    const name = newCategory.trim()
    if (!name) return
    await addCategory.mutateAsync({ name, yearly_allocated: 0, budget_period: 'monthly', color: '#A9F5C7' })
    setNewCategory('')
    toast.success('Category added')
  }

  const handleAddStarterCategories = async () => {
    const existingNames = new Set(categories.map(category => category.name.toLowerCase()))
    const missingCategories = DEFAULT_BUDGET_CATEGORIES.filter(category => !existingNames.has(category.name.toLowerCase()))
    for (const category of missingCategories) {
      await addCategory.mutateAsync(category)
    }
    toast.success(missingCategories.length > 0 ? 'Starter categories restored' : 'Starter categories already complete')
  }

  const handleDeleteCategory = (id: string, name: string) => {
    setConfirmDelete({ kind: 'category', id, name })
  }

  const handleAddWallet = async () => {
    const name = walletName.trim()
    if (!name) return
    await addWallet.mutateAsync({ name, type: walletType, balance: 0, currency: baseCurrency })
    setWalletName('')
    setWalletType('cash')
    toast.success('Wallet added')
  }

  const handleDeleteWallet = (id: string, name: string) => {
    setConfirmDelete({ kind: 'wallet', id, name })
  }

  const confirmDeleteSelected = () => {
    if (!confirmDelete) return
    if (confirmDelete.kind === 'category') {
      deleteCategory.mutate(confirmDelete.id)
      toast.success('Category removed')
    } else {
      deleteWallet.mutate(confirmDelete.id)
      toast.success('Wallet removed')
    }
    setConfirmDelete(null)
  }

  const buildBackup = () => ({
    exported_at: new Date().toISOString(),
    app: 'FinPath',
    version: 1,
    settings,
    wallets,
    budget_categories: categories,
    budget_rules: budgetRules,
    investment_config: investmentConfig,
    estimation_plans: estimationPlans,
    transactions,
  })

  const handleExportBackup = () => {
    const text = JSON.stringify(buildBackup(), null, 2)
    setBackupText(text)
    navigator.clipboard?.writeText(text).catch(() => undefined)
    toast.success('Backup prepared')
  }

  const stripSystemFields = <T extends Record<string, unknown>>(row: T) => {
    const { id, user_id, created_at, ...payload } = row
    return payload
  }

  const handleImportBackup = async () => {
    if (!backupText.trim()) return
    const data = JSON.parse(backupText)
    for (const wallet of data.wallets ?? []) await addWallet.mutateAsync(stripSystemFields(wallet) as Parameters<typeof addWallet.mutateAsync>[0])
    for (const category of data.budget_categories ?? []) await addCategory.mutateAsync(stripSystemFields(category) as Parameters<typeof addCategory.mutateAsync>[0])
    for (const rule of data.budget_rules ?? []) await addBudgetRule.mutateAsync(stripSystemFields(rule) as Parameters<typeof addBudgetRule.mutateAsync>[0])
    if (data.investment_config) await saveInvestmentConfig.mutateAsync(stripSystemFields(data.investment_config))
    for (const plan of data.estimation_plans ?? []) await upsertEstimationPlan.mutateAsync(stripSystemFields(plan) as Parameters<typeof upsertEstimationPlan.mutateAsync>[0])
    for (const tx of data.transactions ?? []) await addTransaction.mutateAsync(stripSystemFields(tx) as Parameters<typeof addTransaction.mutateAsync>[0])
    toast.success('Backup imported')
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, login, currency, and spending categories."
      />
      <Card className="mb-8">
        <CardContent className="flex min-h-[156px] flex-col items-start gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-extrabold text-primary-foreground sm:h-[72px] sm:w-[72px] sm:text-2xl">
              {(name || session?.user.email || 'F').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="break-words text-2xl font-extrabold leading-none text-foreground sm:text-[1.7rem]">{name || 'Empty profile'}</p>
              <p className="mt-2 text-sm text-muted-foreground">{session?.user.email || 'No account connected'}</p>
            </div>
          </div>
          <Button className="px-9" onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Cancel' : 'Edit profile'}
          </Button>
        </CardContent>
      </Card>
      {editMode && (
        <Card className="mb-8">
          <CardContent className="grid grid-cols-1 items-end gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <Label className="text-sm text-muted-foreground">Name</Label>
              <Input aria-label="Profile name" value={name} onChange={event => setName(event.target.value)} className="mt-2 bg-secondary" />
            </div>
            <Button onClick={saveProfile} disabled={saveSettings.isPending}>Save</Button>
          </CardContent>
        </Card>
      )}
      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.3fr)] xl:gap-7">
        <Card>
          <CardHeader><CardTitle className="text-xl">Currency</CardTitle></CardHeader>
          <CardContent className="space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
            <p className="text-sm text-muted-foreground">Set the currency your amounts are saved in, then choose what FinPath displays.</p>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Base currency</Label>
              <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                <SelectTrigger aria-label="Base currency" className="h-12 rounded-2xl bg-secondary font-extrabold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Display currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger aria-label="Display currency" className="h-12 rounded-2xl bg-secondary font-extrabold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={saveCurrency} disabled={saveSettings.isPending}>Save currency</Button>
          </CardContent>
        </Card>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-xl">Category manager</CardTitle>
              <Button variant="secondary" onClick={handleAddStarterCategories} disabled={addCategory.isPending}>
                Restore starter categories
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map(category => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-secondary px-4 py-3"
                >
                  <span className="min-w-0 truncate font-bold text-foreground">{category.name}</span>
                  <button
                    aria-label={`Delete ${category.name} category`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-destructive"
                    onClick={() => handleDeleteCategory(category.id, category.name)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
            <div className="flex max-w-xl flex-col gap-3 sm:flex-row">
              <Input
                className="bg-secondary"
                value={newCategory}
                onChange={event => setNewCategory(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && handleAddCategory()}
                placeholder="New category"
              />
              <Button onClick={handleAddCategory} disabled={addCategory.isPending}>Add</Button>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-7">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Wallets</CardTitle>
            <p className="text-sm text-muted-foreground">Add cash wallets, bank accounts, cards, and e-wallets for transaction tracking.</p>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.45fr)_auto]">
              <Input
                aria-label="Wallet name"
                className="bg-secondary"
                value={walletName}
                onChange={event => setWalletName(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && handleAddWallet()}
                placeholder="Wallet name"
              />
              <select
                aria-label="Wallet type"
                className="h-10 rounded-md border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none"
                value={walletType}
                onChange={event => setWalletType(event.target.value as Wallet['type'])}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="card">Card</option>
                <option value="e_wallet">E-wallet</option>
                <option value="investment">Investment</option>
                <option value="other">Other</option>
              </select>
              <Button onClick={handleAddWallet} disabled={addWallet.isPending}>Add wallet</Button>
            </div>
            <div className="space-y-5">
              {walletGroups.map(group => (
                <div key={group.type}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {WALLET_TYPE_LABELS[group.type] ?? group.type}
                  </p>
                  <div className="space-y-1">
                    {group.wallets.map(wallet => (
                      <div key={wallet.id} className="flex items-center justify-between rounded-xl border border-border bg-secondary px-4 py-2.5">
                        <span className="font-bold text-foreground">{wallet.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-extrabold text-foreground">{money.formatBase(walletBalances.get(wallet.id) ?? 0)}</span>
                          <button
                            aria-label={`Delete ${wallet.name} wallet`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-destructive"
                            onClick={() => handleDeleteWallet(wallet.id, wallet.name)}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {wallets.length === 0 && <p className="text-sm text-muted-foreground">No wallets yet.</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Account access</CardTitle>
            <p className="text-sm text-muted-foreground">Log in or create an account to keep your budget data available across sessions.</p>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
            {session ? (
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-foreground">Logged in</p>
                  <p className="text-sm text-muted-foreground">{session.user.email}</p>
                </div>
                <Button variant="secondary" onClick={() => signOut.mutateAsync()}>Log out</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 items-end gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Email</Label>
                  <Input aria-label="Auth email" className="mt-2 bg-secondary" value={authEmail} onChange={event => setAuthEmail(event.target.value)} placeholder="you@example.com" />
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Password</Label>
                  <Input aria-label="Auth password" className="mt-2 bg-secondary" type="password" value={authPassword} onChange={event => setAuthPassword(event.target.value)} placeholder="Password" />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button onClick={handleSignIn} disabled={signIn.isPending}>Log in</Button>
                  <Button variant="secondary" onClick={handleSignUp} disabled={signUp.isPending}>Sign up</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-xl">Backup and restore</CardTitle>
          <p className="text-sm text-muted-foreground">Export your FinPath data as JSON, or paste a previous backup to restore it into this account.</p>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={handleExportBackup}>Export backup</Button>
            <Button variant="secondary" onClick={handleImportBackup}>Import backup</Button>
          </div>
          <textarea
            aria-label="Backup JSON"
            className="min-h-44 w-full rounded-2xl border border-border bg-secondary p-4 font-mono text-xs text-foreground outline-none"
            value={backupText}
            onChange={event => setBackupText(event.target.value)}
            placeholder="Backup JSON appears here, or paste one to import"
          />
        </CardContent>
      </Card>
      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete ? `Delete ${confirmDelete.name} ${confirmDelete.kind}?` : ''}
        description={confirmDelete?.kind === 'category'
          ? 'Existing transactions will keep their category text, but this option will disappear from new expense forms.'
          : 'Existing transactions will keep their wallet reference, but this wallet will disappear from new entries.'}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmDeleteSelected}
      />
    </div>
  )
}
