import { useEffect, useMemo, useRef, useState, type ElementType } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useAppSettings, useSaveAppSettings,
  useBudgetCategories, useAddBudgetCategory, useDeleteBudgetCategory, useRenameBudgetCategory,
  useBudgetRules, useAddBudgetRule,
  useRenameWallet, useUpdateWallet,
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
import { PIN_STORAGE_KEY, PIN_SESSION_KEY, hashPin } from '@/components/layout/PinLock'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { X, Eye, EyeOff, Shield, Pencil, Check, User, ChevronRight, ChevronLeft, HardDrive, Tag, Sparkles, Wallet as WalletIcon, Upload, Download, Banknote, Landmark, Smartphone, CreditCard, TrendingUp, Package, AlertTriangle, Cloud, Lock, RefreshCw } from 'lucide-react'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { toast } from 'sonner'
import type { CashRole, Wallet } from '@/types'
import { getGeminiKey, saveGeminiKey } from '@/lib/gemini'
import { getFiftyCoinRouting, setFiftyCoinRouting, type FiftyCoinRouting } from '@/lib/cashChange'
import { parseNumberInput, formatNumberInput } from '@/lib/numberInput'

const tabs = ['profile', 'wallets', 'categories', 'ai', 'security', 'backup'] as const
type SettingsTab = typeof tabs[number]
const TAB_META: Record<SettingsTab, { label: string; desc: string; Icon: ElementType; color: string }> = {
  profile:    { label: 'Profile',        desc: 'Name, currency & account',  Icon: User,        color: '#A9F5C7' },
  wallets:    { label: 'Wallets',        desc: 'Cash, bank & cards',        Icon: WalletIcon,  color: '#93C5FD' },
  categories: { label: 'Categories',     desc: 'Budget categories',         Icon: Tag,         color: '#FFD276' },
  ai:         { label: 'AI Features',    desc: 'Gemini AI integration',     Icon: Sparkles,    color: '#C4AEFF' },
  security:   { label: 'Security',       desc: 'PIN lock & privacy',        Icon: Shield,      color: '#FADBEA' },
  backup:     { label: 'Backup & Export',desc: 'Export & import data',      Icon: HardDrive,   color: '#F8DCDC' },
}

const CURRENCIES = ['USD', 'IDR', 'TWD', 'EUR', 'JPY']

const WALLET_TYPE_LABELS: Record<string, string> = {
  cash: 'Cash', bank: 'Bank', card: 'Card',
  e_wallet: 'E-wallet', investment: 'Investment', other: 'Other',
}
const WALLET_TYPE_ORDER = ['cash', 'bank', 'card', 'e_wallet', 'investment', 'other']

const WALLET_TYPE_CARDS = [
  { value: 'cash' as const,       Icon: Banknote,   label: 'Cash' },
  { value: 'bank' as const,       Icon: Landmark,   label: 'Bank' },
  { value: 'e_wallet' as const,   Icon: Smartphone, label: 'E-wallet' },
  { value: 'card' as const,       Icon: CreditCard, label: 'Card' },
  { value: 'investment' as const, Icon: TrendingUp, label: 'Invest' },
  { value: 'other' as const,      Icon: Package,    label: 'Other' },
]

const WALLET_NAME_HINTS: Record<string, string> = {
  cash: 'My wallet', bank: 'BCA / Chase', e_wallet: 'GoPay / PayPal',
  card: 'Visa / Mastercard', investment: 'Stocks', other: 'Misc',
}

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
  const renameCategory = useRenameBudgetCategory()
  const renameWallet = useRenameWallet()
  const updateWallet = useUpdateWallet()
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

  const isDesktop = useIsDesktop()
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt?: () => void } | null>(null)
  const [appInstalled, setAppInstalled] = useState(false)
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isStandalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => { setAppInstalled(true); setInstallPrompt(null) })
    return () => { window.removeEventListener('beforeinstallprompt', handler) }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt || typeof (installPrompt as { prompt?: () => void }).prompt !== 'function') return
    ;(installPrompt as { prompt: () => void }).prompt()
    setInstallPrompt(null)
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const s = new URLSearchParams(window.location.search).get('section')
    return (s && (tabs as readonly string[]).includes(s)) ? s as SettingsTab : 'profile'
  })
  const [mobilePage, setMobilePage] = useState<SettingsTab | null>(() => {
    const s = new URLSearchParams(window.location.search).get('section')
    return (s && (tabs as readonly string[]).includes(s)) ? s as SettingsTab : null
  })
  useEffect(() => {
    const s = searchParams.get('section')
    if (s && (tabs as readonly string[]).includes(s)) {
      setActiveTab(s as SettingsTab)
      if (!isDesktop) setMobilePage(s as SettingsTab)
    } else if (!isDesktop) {
      setMobilePage(null)
    }
  }, [searchParams, isDesktop])
  const effectiveTab = isDesktop ? activeTab : mobilePage
  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('IDR')
  const [currency, setCurrency] = useState('IDR')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [walletName, setWalletName] = useState('')
  const [walletType, setWalletType] = useState<Wallet['type']>('cash')
  const [walletCashRole, setWalletCashRole] = useState<CashRole | ''>('')
  const [walletInitBalance, setWalletInitBalance] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null)
  const [editingWalletName, setEditingWalletName] = useState('')
  const [editingWalletCashRole, setEditingWalletCashRole] = useState<CashRole | ''>('')
  const [backupText, setBackupText] = useState('')
  const backupFileRef = useRef<HTMLInputElement>(null)
  const [backupPreview, setBackupPreview] = useState<null | { wallets: number; categories: number; transactions: number; rules: number; parsed: unknown }>(null)
  const [lastExportDate, setLastExportDate] = useState(() => localStorage.getItem('finpath_last_export') ?? '')
  const [pinInput, setPinInput] = useState('')
  const [pinEnabled, setPinEnabled] = useState(() => Boolean(localStorage.getItem(PIN_STORAGE_KEY)))
  const [geminiKey, setGeminiKey] = useState(() => getGeminiKey() ?? '')
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [fiftyCoinRouting, setFiftyCoinRoutingState] = useState<FiftyCoinRouting>(() => getFiftyCoinRouting())
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

  const handleEnablePin = () => {
    if (pinInput.length !== 4) return
    localStorage.setItem(PIN_STORAGE_KEY, hashPin(pinInput))
    sessionStorage.setItem(PIN_SESSION_KEY, '1')
    setPinInput('')
    setPinEnabled(true)
    toast.success('PIN lock enabled')
  }

  const handleDisablePin = () => {
    localStorage.removeItem(PIN_STORAGE_KEY)
    sessionStorage.removeItem(PIN_SESSION_KEY)
    setPinEnabled(false)
    toast.success('PIN lock removed')
  }

  const handleAddCategory = async () => {
    if (addCategory.isPending) return
    const name = newCategory.trim()
    if (!name) return
    const duplicate = categories.some(c => c.name.toLowerCase() === name.toLowerCase())
    if (duplicate) {
      toast.error(`"${name}" already exists — category names must be unique`)
      return
    }
    try {
      await addCategory.mutateAsync({ name, yearly_allocated: 0, budget_period: 'monthly', color: '#A9F5C7' })
      setNewCategory('')
      toast.success(`Category "${name}" added`)
    } catch {
      toast.error('Failed to add category — please try again')
    }
  }

  const handleAddStarterCategories = async () => {
    const existingNames = new Set(categories.map(category => category.name.toLowerCase()))
    const missingCategories = DEFAULT_BUDGET_CATEGORIES.filter(category => !existingNames.has(category.name.toLowerCase()))
    for (const category of missingCategories) {
      await addCategory.mutateAsync(category)
    }
    toast.success(missingCategories.length > 0 ? 'Starter categories restored' : 'Starter categories already complete')
  }

  const handleStartRename = (id: string, name: string) => {
    setEditingCategoryId(id)
    setEditingCategoryName(name)
  }

  const handleSaveRename = async () => {
    if (!editingCategoryId) return
    const trimmed = editingCategoryName.trim()
    if (!trimmed) return
    const duplicate = categories.some(c => c.id !== editingCategoryId && c.name.toLowerCase() === trimmed.toLowerCase())
    if (duplicate) {
      toast.error(`"${trimmed}" already exists`)
      return
    }
    try {
      await renameCategory.mutateAsync({ id: editingCategoryId, name: trimmed })
      setEditingCategoryId(null)
      toast.success('Category renamed')
    } catch {
      toast.error('Failed to rename')
    }
  }

  const handleDeleteCategory = (id: string, name: string) => {
    setConfirmDelete({ kind: 'category', id, name })
  }

  const handleAddWallet = async () => {
    const name = walletName.trim()
    if (!name) return
    const initBalance = walletInitBalance ? money.toBase(parseNumberInput(walletInitBalance), money.displayCurrency) : 0
    try {
      await addWallet.mutateAsync({
        name,
        type: walletType,
        balance: initBalance,
        currency: baseCurrency,
        cash_role: walletType === 'cash' && walletCashRole ? walletCashRole : null,
      })
      setWalletName('')
      setWalletType('cash')
      setWalletCashRole('')
      setWalletInitBalance('')
      toast.success('Wallet added')
    } catch {
      toast.error('Failed to add wallet — please try again')
    }
  }

  const handleDeleteWallet = (id: string, name: string) => {
    setConfirmDelete({ kind: 'wallet', id, name })
  }

  const handleSaveWalletRename = async () => {
    if (!editingWalletId) return
    const trimmed = editingWalletName.trim()
    if (!trimmed) return
    const wallet = wallets.find(w => w.id === editingWalletId)
    try {
      if (wallet?.type === 'cash') {
        await updateWallet.mutateAsync({ id: editingWalletId, name: trimmed, cash_role: editingWalletCashRole || null })
      } else {
        await renameWallet.mutateAsync({ id: editingWalletId, name: trimmed })
      }
      setEditingWalletId(null)
      toast.success('Wallet updated')
    } catch {
      toast.error('Failed to update wallet')
    }
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
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finpath-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem('finpath_last_export', today)
    setLastExportDate(today)
    toast.success('Backup downloaded')
  }

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? ''
      setBackupText(text)
      try {
        const parsed = JSON.parse(text)
        setBackupPreview({
          wallets: (parsed.wallets ?? []).length,
          categories: (parsed.budget_categories ?? []).length,
          transactions: (parsed.transactions ?? []).length,
          rules: (parsed.budget_rules ?? []).length,
          parsed,
        })
      } catch {
        setBackupPreview(null)
        toast.error('Invalid backup file — could not parse JSON')
      }
    }
    reader.readAsText(file)
    if (backupFileRef.current) backupFileRef.current.value = ''
  }

  const stripSystemFields = <T extends Record<string, unknown>>(row: T) => {
    const { id, user_id, created_at, ...payload } = row
    return payload
  }

  const handleImportBackup = async () => {
    if (!backupText.trim() && !backupPreview) return
    const data = backupPreview ? (backupPreview.parsed as Record<string, unknown[]>) : JSON.parse(backupText)
    for (const wallet of (data.wallets as Record<string, unknown>[] ?? [])) await addWallet.mutateAsync(stripSystemFields(wallet) as Parameters<typeof addWallet.mutateAsync>[0])
    for (const category of (data.budget_categories as Record<string, unknown>[] ?? [])) await addCategory.mutateAsync(stripSystemFields(category) as Parameters<typeof addCategory.mutateAsync>[0])
    for (const rule of (data.budget_rules as Record<string, unknown>[] ?? [])) await addBudgetRule.mutateAsync(stripSystemFields(rule) as Parameters<typeof addBudgetRule.mutateAsync>[0])
    if (data.investment_config) await saveInvestmentConfig.mutateAsync(stripSystemFields(data.investment_config as Record<string, unknown>))
    for (const plan of (data.estimation_plans as Record<string, unknown>[] ?? [])) await upsertEstimationPlan.mutateAsync(stripSystemFields(plan) as Parameters<typeof upsertEstimationPlan.mutateAsync>[0])
    for (const tx of (data.transactions as Record<string, unknown>[] ?? [])) await addTransaction.mutateAsync(stripSystemFields(tx) as Parameters<typeof addTransaction.mutateAsync>[0])
    setBackupPreview(null)
    setBackupText('')
    toast.success('Backup imported successfully')
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={<><span className="hidden sm:inline">Manage your profile, login, currency, and spending categories.</span><span className="sm:hidden">Profile, security, and preferences.</span></>}
      />
      {!session && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FFCF73]" />
          <div>
            <p className="font-bold text-[#FFCF73]">Guest mode — data is not saved to the cloud</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Your budgets, wallets, and transactions are stored in this browser only. Log in to keep your data safe and sync across devices.</p>
          </div>
        </div>
      )}

      {/* Desktop: pill tab bar */}
      <div className="mb-8 hidden flex-wrap gap-2 overflow-x-auto lg:flex">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
          >
            {TAB_META[tab].label}
          </button>
        ))}
      </div>

      {/* iOS install guidance */}
      {!effectiveTab && isIos && !isStandalone && !appInstalled && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 lg:hidden">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Smartphone className="h-4 w-4 text-primary" /></span>
          <div className="min-w-0">
            <p className="font-bold text-foreground">Add to Home Screen</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tap the <strong>Share</strong> button in Safari, then choose <strong>Add to Home Screen</strong> for the full app experience.
            </p>
          </div>
        </div>
      )}

      {/* PWA install banner */}
      {!effectiveTab && installPrompt && !appInstalled && (
        <div className="mb-4 flex items-center gap-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 lg:hidden">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-foreground">Install FinPath</p>
            <p className="text-xs text-muted-foreground">Add to home screen for faster access offline</p>
          </div>
          <button
            type="button"
            onClick={handleInstall}
            className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground"
          >
            Install
          </button>
        </div>
      )}

      {/* Mobile: native-style settings list (shown when no page selected) */}
      {!effectiveTab && (
        <div className="mb-8 overflow-hidden rounded-2xl border border-border bg-card lg:hidden">
          {tabs.map((tab, i) => {
            const { label, desc, Icon, color } = TAB_META[tab]
            return (
              <button
                key={tab}
                onClick={() => {
                  setMobilePage(tab)
                  setSearchParams({ section: tab })
                }}
                className={`flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors active:bg-muted/40 ${i < tabs.length - 1 ? 'border-b border-border' : ''}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: color + '33' }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )
          })}
        </div>
      )}

      {/* Mobile: back button when a page is selected */}
      {effectiveTab && !isDesktop && (
        <button
          onClick={() => {
            setMobilePage(null)
            setSearchParams({})
          }}
          className="mb-6 flex items-center gap-2 text-sm font-bold text-primary lg:hidden"
        >
          <ChevronLeft className="h-4 w-4" />
          Settings
        </button>
      )}

      {/* Profile tab */}
      {effectiveTab === 'profile' && (
        <>
          <Card className="mb-8">
            <CardContent className="flex min-h-[156px] flex-col items-start gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="flex min-w-0 items-center gap-4 sm:gap-6">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-extrabold text-primary-foreground sm:h-[72px] sm:w-[72px] sm:text-2xl">
                  {(name || session?.user.email || 'F').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="break-words text-2xl font-extrabold leading-none text-foreground sm:text-[1.7rem]">{name || 'Empty profile'}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{session?.user.email || 'No account connected'}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${session ? 'bg-primary' : 'bg-[#FFCF73]'}`} />
                    {session ? 'Cloud sync enabled' : 'Guest mode — data saved locally only'}
                  </p>
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
          <Card className="mb-8 lg:hidden">
            <CardHeader>
              <CardTitle className="text-xl">Account access</CardTitle>
              <p className="text-sm text-muted-foreground">Log in or create an account to keep your data safe. On desktop, use the profile icon in the sidebar.</p>
            </CardHeader>
            <CardContent className="space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
              {session ? (
                <div className="flex flex-col gap-4 rounded-2xl border border-border bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-foreground">Logged in</p>
                    <p className="text-sm text-muted-foreground">{session.user.email}</p>
                  </div>
                  <Button variant="secondary" disabled={signOut.isPending} onClick={() => signOut.mutateAsync()}>Log out</Button>
                </div>
              ) : (
                <div className="grid max-w-md grid-cols-1 items-end gap-4">
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
          <Card className="mb-8">
            <CardHeader><CardTitle className="text-xl">Currency</CardTitle></CardHeader>
            <CardContent className="space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
              <p className="text-sm text-muted-foreground">Set the currency your amounts are saved in, then choose what FinPath displays.</p>

              {/* Currency status banner */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-secondary px-4 py-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-muted-foreground">Display currency: <span className="text-foreground">{money.displayCurrency}</span></p>
                  <p className="text-xs font-bold text-muted-foreground">Base currency: <span className="text-foreground">{money.baseCurrency}</span></p>
                </div>
                <p className="text-right text-xs text-muted-foreground">
                  {money.ratesDate ? `Rates: ${money.ratesDate}` : <span className="text-[#FFCF73]">Using fallback rates</span>}
                </p>
              </div>

              {/* Conversion preview */}
              {money.baseCurrency !== money.displayCurrency && (
                <div className="rounded-2xl border border-border bg-secondary px-4 py-3 text-xs text-muted-foreground">
                  <p>1 {money.baseCurrency} ≈ {money.format(money.fromBase(1, money.displayCurrency), money.displayCurrency)}</p>
                  <p className="mt-0.5">1 {money.displayCurrency} ≈ {money.formatBase(money.toBase(1, money.displayCurrency))}</p>
                </div>
              )}

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
        </>
      )}

      {/* Wallets tab */}
      {effectiveTab === 'wallets' && (
        <>
        {/* Cash setup guide — shown when no cash wallets have a role yet */}
        {wallets.length > 0 && !wallets.some(w => w.type === 'cash' && w.cash_role) && (
          <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Cash setup guide</p>
            <p className="mt-2 text-sm font-bold text-foreground">Set up your cash wallets for automatic change routing</p>
            <p className="mt-1 text-xs text-muted-foreground">When you pay cash, FinPath can automatically split change into bills and coins. To enable this, create two cash wallets and assign roles:</p>
            <div className="mt-3 space-y-2">
              {[
                { step: '1', title: 'Main cash wallet', desc: 'Your physical wallet — stores NT$100+ bills. Set role to "Notes / Wallet".', done: wallets.some(w => w.type === 'cash' && w.cash_role === 'notes') },
                { step: '2', title: 'Coin pouch', desc: 'Your coin pouch — receives change under NT$100. Set role to "Coins / Pouch".', done: wallets.some(w => w.type === 'cash' && w.cash_role === 'coins') },
                { step: '3', title: 'Record a cash payment', desc: 'Enable "Paid with cash" in Quick Add and enter the bill you gave.', done: false },
              ].map(({ step, title, desc, done }) => (
                <div key={step} className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${done ? 'bg-primary/10' : 'bg-secondary/60'}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {done ? <Check className="h-3.5 w-3.5" /> : step}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${done ? 'text-primary' : 'text-foreground'}`}>{title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {wallets.some(w => w.type === 'cash') && (
          <div className="mb-6 rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">Cash preferences</p>
            <p className="mt-2 text-sm font-bold text-foreground">Change routing</p>
            <p className="mt-1 text-xs text-muted-foreground">Choose how FinPath splits NT$ change after a cash payment.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {([
                ['coins', 'Coin pouch', 'NT$50 goes to your coin pouch with smaller coins.'],
                ['notes', 'Main wallet', 'NT$50 stays in your notes wallet alongside NT$100+.'],
                ['all-coins', 'All change to pouch', 'Every NT$ of change routes to the coin pouch.'],
              ] as const).map(([val, label, desc]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => { setFiftyCoinRoutingState(val); setFiftyCoinRouting(val) }}
                  className={`flex-1 min-w-0 rounded-xl border px-4 py-3 text-left transition-colors ${fiftyCoinRouting === val ? 'border-primary bg-primary/10' : 'border-border bg-secondary hover:border-primary/40'}`}
                >
                  <p className={`text-sm font-bold ${fiftyCoinRouting === val ? 'text-primary' : 'text-foreground'}`}>{label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl">Wallets</CardTitle>
            <p className="text-sm text-muted-foreground">Add cash wallets, bank accounts, cards, and e-wallets for transaction tracking.</p>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="space-y-4 rounded-2xl border border-border bg-secondary/40 p-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Wallet type</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {WALLET_TYPE_CARDS.map(({ value, Icon, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => { setWalletType(value); setWalletCashRole('') }}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-colors active:scale-95 ${walletType === value ? 'border-primary bg-primary/10' : 'border-border bg-secondary hover:border-primary/40'}`}
                    >
                      <Icon className={`h-5 w-5 ${walletType === value ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className={`text-xs font-bold ${walletType === value ? 'text-primary' : 'text-muted-foreground'}`}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {walletType === 'cash' && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cash role</p>
                  <div className="flex flex-wrap gap-2">
                    {([['', 'General'], ['notes', 'Notes / Wallet'], ['coins', 'Coins / Pouch'], ['mixed', 'Mixed']] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setWalletCashRole(val as CashRole | '')}
                        className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors active:scale-95 ${walletCashRole === val ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {walletCashRole && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {walletCashRole === 'notes' && 'Bills wallet — NT$100+ change will route here. Use for your main cash wallet.'}
                      {walletCashRole === 'coins' && 'Coins pouch — change under NT$100 routes here automatically after cash payments.'}
                      {walletCashRole === 'mixed' && 'Mixed wallet — holds both bills and coins. Change routing goes here for non-TWD currencies.'}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  aria-label="Wallet name"
                  className="bg-background"
                  value={walletName}
                  onChange={event => setWalletName(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleAddWallet()}
                  placeholder={`Name — e.g. ${WALLET_NAME_HINTS[walletType] ?? 'My wallet'}`}
                />
                <Input
                  aria-label="Initial balance (optional)"
                  className="bg-background sm:w-32"
                  value={walletInitBalance}
                  onChange={e => setWalletInitBalance(formatNumberInput(e.target.value))}
                  onKeyDown={event => event.key === 'Enter' && handleAddWallet()}
                  placeholder="Balance (opt.)"
                  inputMode="decimal"
                />
                <Button onClick={handleAddWallet} disabled={addWallet.isPending || !walletName.trim()}>Add wallet</Button>
              </div>
            </div>
            <div className="max-h-[320px] overflow-y-auto space-y-5 pr-1">
              {walletGroups.map(group => (
                <div key={group.type}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {WALLET_TYPE_LABELS[group.type] ?? group.type}
                  </p>
                  <div className="space-y-1">
                    {group.wallets.map(wallet => (
                      <div key={wallet.id} className={`rounded-xl border border-border bg-secondary px-4 py-2.5 ${editingWalletId === wallet.id ? 'flex flex-col gap-2' : 'flex items-center justify-between gap-2'}`}>
                        {editingWalletId === wallet.id ? (
                          <>
                            <div className="flex items-center gap-2">
                              <input
                                aria-label={`New name for ${wallet.name} wallet`}
                                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm font-bold text-foreground outline-none focus:border-primary"
                                value={editingWalletName}
                                autoFocus
                                onChange={e => setEditingWalletName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveWalletRename()
                                  if (e.key === 'Escape') setEditingWalletId(null)
                                }}
                              />
                              <button
                                aria-label="Save wallet rename"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={handleSaveWalletRename}
                                disabled={updateWallet.isPending || renameWallet.isPending}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                aria-label="Cancel wallet rename"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
                                onClick={() => setEditingWalletId(null)}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            {wallet.type === 'cash' && (
                              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                                <span className="text-xs font-bold text-muted-foreground">Cash role:</span>
                                {([['', 'General'], ['notes', 'Notes / Wallet'], ['coins', 'Coins / Pouch'], ['mixed', 'Mixed']] as const).map(([val, label]) => (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => setEditingWalletCashRole(val as CashRole | '')}
                                    className={`rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors ${editingWalletCashRole === val ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate font-bold text-foreground">
                              {wallet.name}
                              {wallet.cash_role && (
                                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                                  {wallet.cash_role === 'notes' ? 'Notes' : wallet.cash_role === 'coins' ? 'Coins' : wallet.cash_role === 'mixed' ? 'Mixed' : 'Digital'}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 font-extrabold text-foreground">{money.formatDisplay(walletBalances.get(wallet.id) ?? 0)}</span>
                            <button
                              aria-label={`Rename ${wallet.name} wallet`}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-primary"
                              onClick={() => { setEditingWalletId(wallet.id); setEditingWalletName(wallet.name); setEditingWalletCashRole(wallet.cash_role ?? '') }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              aria-label={`Delete ${wallet.name} wallet`}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-destructive"
                              onClick={() => handleDeleteWallet(wallet.id, wallet.name)}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {wallets.length === 0 && <p className="text-sm text-muted-foreground">No wallets yet.</p>}
            </div>
          </CardContent>
        </Card>
        </>
      )}

      {/* Categories tab */}
      {effectiveTab === 'categories' && (
        <Card className="mb-8">
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
                  className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-secondary px-4 py-3"
                >
                  {editingCategoryId === category.id ? (
                    <>
                      <input
                        aria-label={`New name for ${category.name} category`}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm font-bold text-foreground outline-none focus:border-primary"
                        value={editingCategoryName}
                        autoFocus
                        onChange={e => setEditingCategoryName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveRename()
                          if (e.key === 'Escape') setEditingCategoryId(null)
                        }}
                      />
                      <button
                        aria-label="Save rename"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={handleSaveRename}
                        disabled={renameCategory.isPending}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        aria-label="Cancel rename"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => setEditingCategoryId(null)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 truncate font-bold text-foreground">{category.name}</span>
                      <button
                        aria-label={`Rename ${category.name} category`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-primary"
                        onClick={() => handleStartRename(category.id, category.name)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label={`Delete ${category.name} category`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-destructive"
                        onClick={() => handleDeleteCategory(category.id, category.name)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
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
      )}

      {/* AI Features tab */}
      {effectiveTab === 'ai' && !isDesktop && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl">AI status</CardTitle>
            <p className="text-sm text-muted-foreground">Desktop setup required for API keys. Mobile only shows whether AI is enabled.</p>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-6">
            <div className={`rounded-2xl border px-4 py-3 ${geminiKey ? 'border-primary/30 bg-primary/5' : 'border-[#FFCF73]/30 bg-[#FFCF73]/5'}`}>
              <p className={`text-sm font-extrabold ${geminiKey ? 'text-primary' : 'text-[#FFCF73]'}`}>
                {geminiKey ? 'AI enabled' : 'AI disabled'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {geminiKey
                  ? 'Receipt scanning and generated insights can use your saved desktop setup.'
                  : 'Set up your Gemini API key from desktop to enable AI summaries and receipt scanning.'}
              </p>
            </div>
            <Button variant="secondary" className="w-full" onClick={() => toast.info('Open FinPath on desktop, then go to Settings -> AI status.')}>
              Open on desktop
            </Button>
          </CardContent>
        </Card>
      )}
      {effectiveTab === 'ai' && isDesktop && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl">AI Features</CardTitle>
            <p className="text-sm text-muted-foreground">
              Power receipt scanning and spending insights with the free{' '}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="font-bold text-primary underline-offset-2 hover:underline">
                Gemini API
              </a>
              . Get a free key at aistudio.google.com.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
            {/* Privacy explanation */}
            <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="space-y-2 text-sm">
                <p className="font-bold text-foreground">What FinPath AI can access:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>· Your spending categories and amounts</li>
                  <li>· Budget limits and usage percentages</li>
                  <li>· Goal names and progress</li>
                  <li>· Monthly income and expense totals</li>
                </ul>
                <p className="font-bold text-foreground">What is NOT shared:</p>
                <p className="text-muted-foreground">Transaction descriptions, merchant names, wallet details, or any personal account info.</p>
                <p className="text-xs text-primary">Your API key is stored only in your browser's localStorage. It is never sent to FinPath's servers.</p>
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Gemini API key</Label>
              <div className="mt-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    aria-label="Gemini API key"
                    className="bg-secondary pr-10 font-mono text-sm"
                    type={showGeminiKey ? 'text' : 'password'}
                    value={geminiKey}
                    onChange={e => setGeminiKey(e.target.value)}
                    placeholder="AIzaSy…"
                  />
                  <button
                    type="button"
                    aria-label={showGeminiKey ? 'Hide key' : 'Show key'}
                    onClick={() => setShowGeminiKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  onClick={() => {
                    saveGeminiKey(geminiKey.trim())
                    toast.success(geminiKey.trim() ? 'Gemini API key saved' : 'Gemini API key removed')
                  }}
                >
                  Save
                </Button>
              </div>
              {geminiKey && <p className="mt-2 flex items-center gap-1.5 text-xs text-primary"><Check className="h-3 w-3 shrink-0" /> Key saved — receipt scanning and AI insights are enabled</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security tab */}
      {effectiveTab === 'security' && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl">PIN lock</CardTitle>
            <p className="text-sm text-muted-foreground">Protect this browser session with a 4-digit PIN. PIN lock is not a replacement for account security — it only locks this device's screen.</p>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
            {pinEnabled ? (
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-bold text-foreground">PIN lock is active</p>
                <Button variant="secondary" onClick={handleDisablePin}>Remove PIN</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div>
                  <Label className="text-sm text-muted-foreground">New PIN (4 digits)</Label>
                  <Input
                    aria-label="New PIN"
                    className="mt-2 w-32 bg-secondary text-center tracking-[0.5em]"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pinInput}
                    onChange={event => setPinInput(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                  />
                </div>
                <Button onClick={handleEnablePin} disabled={pinInput.length !== 4}>Enable PIN</Button>
              </div>
            )}

            {/* Privacy & Data info */}
            <div className="rounded-2xl border border-border bg-secondary p-4 text-sm space-y-2">
              <p className="font-bold text-foreground">Privacy & Data</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>· Your data is stored in your account or locally in guest mode.</li>
                <li>· FinPath does not connect to bank accounts.</li>
                <li>· PIN lock protects this browser session only.</li>
                <li>· Export your data anytime from Backup &amp; Export.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backup & Export tab */}
      {effectiveTab === 'backup' && (
        <>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl">Data Safety</CardTitle>
            <p className="text-sm text-muted-foreground">Your data privacy and backup status at a glance.</p>
          </CardHeader>
          <CardContent className="px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    label: 'Storage',
                    value: session ? 'Cloud (Supabase)' : 'This device only',
                    status: session ? 'ok' : 'info',
                    Icon: session ? Cloud : Smartphone,
                  },
                  {
                    label: 'Last backup',
                    value: lastExportDate ? new Date(lastExportDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never',
                    status: lastExportDate ? 'ok' : 'warn',
                    Icon: HardDrive,
                  },
                  {
                    label: 'PIN lock',
                    value: pinEnabled ? 'Enabled' : 'Off',
                    status: pinEnabled ? 'ok' : 'info',
                    Icon: Lock,
                  },
                  {
                    label: 'Cloud sync',
                    value: session ? 'Active' : 'Off (guest mode)',
                    status: session ? 'ok' : 'info',
                    Icon: RefreshCw,
                  },
                ] as { label: string; value: string; status: string; Icon: ElementType }[]
              ).map(item => (
                <div key={item.label} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${item.status === 'warn' ? 'border-[#FFCF73]/30 bg-[#FFCF73]/5' : 'border-border bg-secondary'}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/60">
                    <item.Icon className={`h-4 w-4 ${item.status === 'warn' ? 'text-[#FFCF73]' : item.status === 'ok' ? 'text-primary' : 'text-muted-foreground'}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className={`truncate text-sm font-bold ${item.status === 'warn' ? 'text-[#FFCF73]' : item.status === 'ok' ? 'text-primary' : 'text-foreground'}`}>{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
            {!lastExportDate && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-[#FFCF73]"><AlertTriangle className="h-3 w-3 shrink-0" /> No backup created yet. Export your data to keep it safe.</p>
            )}
          </CardContent>
        </Card>
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl">Backup and restore</CardTitle>
            <p className="text-sm text-muted-foreground">Export your FinPath data as a JSON file, or upload a previous backup to restore it.</p>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-6 sm:px-8 sm:pb-8">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="gap-2" onClick={handleExportBackup}>
                <Download className="h-4 w-4" />
                Export backup
              </Button>
              <Button variant="secondary" className="gap-2" onClick={() => backupFileRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Choose backup file
              </Button>
            </div>
            <input
              ref={backupFileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileLoad}
            />

            {/* Import preview */}
            {backupPreview && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                <p className="text-sm font-bold text-foreground">Ready to import</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Wallets', count: backupPreview.wallets },
                    { label: 'Categories', count: backupPreview.categories },
                    { label: 'Transactions', count: backupPreview.transactions },
                    { label: 'Budget rules', count: backupPreview.rules },
                  ].map(({ label, count }) => (
                    <div key={label} className="rounded-xl bg-secondary px-3 py-2 text-center">
                      <p className="text-lg font-extrabold text-foreground">{count}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">These records will be added to your existing data. Existing records are not removed.</p>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={handleImportBackup}>
                    Confirm import
                  </Button>
                  <Button variant="secondary" onClick={() => { setBackupPreview(null); setBackupText('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!backupPreview && isDesktop && (
              <>
                <p className="text-center text-xs text-muted-foreground">— or paste backup JSON below —</p>
                <textarea
                  aria-label="Backup JSON"
                  className="min-h-44 w-full rounded-2xl border border-border bg-secondary p-4 font-mono text-xs text-foreground outline-none focus:border-primary"
                  value={backupText}
                  onChange={event => {
                    setBackupText(event.target.value)
                    setBackupPreview(null)
                  }}
                  placeholder="Paste backup JSON here to import, or export to see your data"
                />
                {backupText.trim() && (
                  <Button variant="secondary" className="w-full" onClick={() => {
                    try {
                      const parsed = JSON.parse(backupText)
                      setBackupPreview({
                        wallets: (parsed.wallets ?? []).length,
                        categories: (parsed.budget_categories ?? []).length,
                        transactions: (parsed.transactions ?? []).length,
                        rules: (parsed.budget_rules ?? []).length,
                        parsed,
                      })
                    } catch {
                      toast.error('Invalid JSON — check your backup text')
                    }
                  }}>
                    Preview import
                  </Button>
                )}
              </>
            )}
            {!backupPreview && !isDesktop && (
              <p className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
                Raw JSON import is desktop-only. On mobile, choose a backup file and confirm the summary before importing.
              </p>
            )}
          </CardContent>
        </Card>
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete ? `Delete ${confirmDelete.name} ${confirmDelete.kind}?` : ''}
        description={(() => {
          if (!confirmDelete) return ''
          const txCount = confirmDelete.kind === 'category'
            ? transactions.filter(t => t.category === confirmDelete.name).length
            : transactions.filter(t => t.wallet_id === confirmDelete.id).length
          const txNote = txCount > 0
            ? `${txCount} transaction${txCount !== 1 ? 's' : ''} reference this ${confirmDelete.kind}. `
            : ''
          return confirmDelete.kind === 'category'
            ? `${txNote}Existing transactions keep their category label but it will disappear from new expense forms.`
            : `${txNote}Existing transactions keep their wallet reference but this wallet will disappear from new entries.`
        })()}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={confirmDeleteSelected}
      />
    </div>
  )
}
