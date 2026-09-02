import { useEffect, useMemo, useRef, useState, type ElementType } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  useAppSettings, useSaveAppSettings,
  useBudgetCategories, useAddBudgetCategory, useDeleteBudgetCategory, useRenameBudgetCategory,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DEFAULT_BUDGET_CATEGORIES } from '@/lib/categories'
import { useMoney } from '@/lib/currency'
import { PIN_STORAGE_KEY, PIN_SESSION_KEY, hashPin, registerBiometric, BIOMETRIC_CRED_KEY } from '@/components/layout/PinLock'
import { generateTOTPSecret, generateTOTPQRCode, verifyTOTP } from '@/lib/totp'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { X, Shield, Pencil, Check, User, ChevronRight, ChevronLeft, HardDrive, Tag, Sparkles, Wallet as WalletIcon, Upload, Download, Banknote, Landmark, Smartphone, CreditCard, TrendingUp, Package, AlertTriangle, Cloud, Lock, RefreshCw } from 'lucide-react'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { MoneyField } from '@/components/mobile/MoneyField'
import { toast } from 'sonner'
import type { CashRole, Wallet } from '@/types'
import { getFiftyCoinRouting, setFiftyCoinRouting, type FiftyCoinRouting } from '@/lib/cashChange'
import { parseNumberInput, formatNumberInput } from '@/lib/numberInput'
import { getQueue } from '@/lib/offlineCache'
import { getWalletBalances } from '@/lib/financeOs'
import { safeGet, todayLocal } from '@/lib/utils'
import { saveGeminiKey, isAiConfigured } from '@/lib/ai'
import { deleteAccountAndData, clearLocalFinPathKeys } from '@/lib/account'
import { clearGuestData } from '@/lib/localStore'

const tabs = ['profile', 'wallets', 'categories', 'security', 'backup', 'ai'] as const
type SettingsTab = typeof tabs[number]
const TAB_META: Record<SettingsTab, { label: string; desc: string; Icon: ElementType; color: string }> = {
  profile:    { label: 'Profile',        desc: 'Name, currency & account',  Icon: User,        color: '#A9F5C7' },
  wallets:    { label: 'Wallets',        desc: 'Cash, bank & cards',        Icon: WalletIcon,  color: '#93C5FD' },
  categories: { label: 'Categories',     desc: 'Budget categories',         Icon: Tag,         color: '#FFD276' },
  security:   { label: 'Security',       desc: 'PIN lock & privacy',        Icon: Shield,      color: '#FADBEA' },
  backup:     { label: 'Backup & Export',desc: 'Export & import data',      Icon: HardDrive,   color: '#F8DCDC' },
  ai:         { label: 'AI Features',    desc: 'Gemini key & AI insights',  Icon: Sparkles,    color: '#C4AEFF' },
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

const EMOJI_PALETTE = ['💰', '🍔', '🛒', '🚗', '⛽', '🏠', '⚡', '📱', '💻', '🎮', '📚', '💊', '✈️', '🏖️', '🎁', '💼', '🧾', '🎬', '☕', '👕', '💄', '🐾', '🎓', '🏦', '🛡️', '🎵', '🧹', '🍼', '💪', '🎉']

function EmojiPicker({ value, onChange, ariaLabel }: { value: string; onChange: (emoji: string) => void; ariaLabel: string }) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {EMOJI_PALETTE.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => onChange(value === emoji ? '' : emoji)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors ${value === emoji ? 'bg-primary/20 ring-1 ring-primary' : 'bg-secondary hover:bg-muted'}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
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
  const { data: investmentConfig } = useInvestmentConfig()
  const { data: estimationPlans = [] } = useEstimationPlans()
  const addWallet = useAddWallet()
  const deleteWallet = useDeleteWallet()
  const addTransaction = useAddTransaction()
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
    if (!s) {
      setMobilePage(null)
      return
    }
    if ((tabs as readonly string[]).includes(s)) {
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
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const navigate = useNavigate()
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newCategoryIcon, setNewCategoryIcon] = useState('')
  const [walletName, setWalletName] = useState('')
  const [walletType, setWalletType] = useState<Wallet['type']>('cash')
  const [walletCashRole, setWalletCashRole] = useState<CashRole | ''>('')
  const [walletInitBalance, setWalletInitBalance] = useState('')
  const [showAddWallet, setShowAddWallet] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryIcon, setEditingCategoryIcon] = useState('')
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null)
  const [editingWalletName, setEditingWalletName] = useState('')
  const [editingWalletCashRole, setEditingWalletCashRole] = useState<CashRole | ''>('')
  const [editingWalletLimit, setEditingWalletLimit] = useState('')
  const [walletMonthlyLimit, setWalletMonthlyLimit] = useState('')
  const [backupText, setBackupText] = useState('')
  const backupFileRef = useRef<HTMLInputElement>(null)
  const [backupPreview, setBackupPreview] = useState<null | { wallets: number; categories: number; transactions: number; rules: number; parsed: unknown }>(null)
  const [lastExportDate, setLastExportDate] = useState(() => safeGet('finpath_last_export') ?? '')
  const [pinInput, setPinInput] = useState('')
  const [pinEnabled, setPinEnabled] = useState(() => Boolean(safeGet(PIN_STORAGE_KEY)))
  const [biometricEnabled, setBiometricEnabled] = useState(() => Boolean(safeGet(BIOMETRIC_CRED_KEY)))
  const [biometricRegistering, setBiometricRegistering] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(() => Boolean(safeGet('finpath_totp_secret')))
  const [totpSetup, setTotpSetup] = useState(false)
  const [totpSecret, setTotpSecret] = useState('')
  const [totpQRCode, setTotpQRCode] = useState('')
  const [totpToken, setTotpToken] = useState('')
  const [totpVerifying, setTotpVerifying] = useState(false)
  const [fiftyCoinRouting, setFiftyCoinRoutingState] = useState<FiftyCoinRouting>(() => getFiftyCoinRouting())
  const [geminiKey, setGeminiKey] = useState(() => safeGet('finpath_gemini_key') ?? '')
  const [aiConfigured, setAiConfigured] = useState(() => isAiConfigured())
  const [confirmDelete, setConfirmDelete] = useState<null | {
    kind: 'category' | 'wallet'
    id: string
    name: string
  }>(null)
  const walletBalances = getWalletBalances(wallets, transactions)

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
    const rawBase = settings?.base_currency ?? 'IDR'
    const rawView = settings?.currency ?? 'IDR'
    setBaseCurrency(rawBase !== 'IDR' ? rawBase : rawView)
  }, [settings, session])

  const baseSettings = {
    id: settings?.id,
    user_name: name,
    email: session?.user.email || '',
    theme: settings?.theme ?? 'dark',
    base_currency: baseCurrency,
    currency: baseCurrency,
    year_start: settings?.year_start ?? '',
    default_view: settings?.default_view ?? '',
    notifications: settings?.notifications ?? '',
    annual_goal_label: settings?.annual_goal_label ?? '',
    annual_goal_pct: settings?.annual_goal_pct ?? 0,
  }

  const saveProfile = async () => {
    try {
      await saveSettings.mutateAsync(baseSettings)
      setEditMode(false)
      toast.success('Profile updated')
    } catch {
      toast.error('Something went wrong — please try again')
    }
  }

  const saveCurrency = async () => {
    try {
      await saveSettings.mutateAsync(baseSettings)
      toast.success('Currency saved')
    } catch {
      toast.error('Something went wrong — please try again')
    }
  }

  const handleSignIn = async () => {
    try {
      await signIn.mutateAsync({ email: authEmail, password: authPassword })
      toast.success('Logged in')
    } catch {
      toast.error('Something went wrong — please try again')
    }
  }

  const handleSignUp = async () => {
    try {
      await signUp.mutateAsync({ email: authEmail, password: authPassword })
      toast.success('Signup started. Check your email if confirmation is enabled.')
    } catch {
      toast.error('Something went wrong — please try again')
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut.mutateAsync()
      toast.success('Logged out')
    } catch {
      toast.error('Something went wrong — please try again')
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE' || deletingAccount) return
    setDeletingAccount(true)
    try {
      await deleteAccountAndData()
      clearLocalFinPathKeys()
      clearGuestData()
      toast.success('Account and all data deleted')
      navigate('/auth', { replace: true })
    } catch {
      toast.error('Failed to delete account — please try again')
      setDeletingAccount(false)
    }
  }

  const handleClearGuestData = () => {
    clearGuestData()
    clearLocalFinPathKeys()
    toast.success('Local data cleared')
    navigate('/auth', { replace: true })
  }

  const handleSaveAiKey = (keyOverride?: string) => {
    const key = (keyOverride ?? geminiKey).trim()
    try {
      saveGeminiKey(key)
      // Keep the key visible (masked) so it's obvious the save stuck.
      setGeminiKey(key)
      setAiConfigured(isAiConfigured())
      toast.success(key ? 'AI key saved on this device' : 'AI key removed')
    } catch {
      toast.error('Something went wrong — please try again')
    }
  }

  const handleEnablePin = async () => {
    if (pinInput.length !== 4) return
    localStorage.setItem(PIN_STORAGE_KEY, await hashPin(pinInput))
    sessionStorage.setItem(PIN_SESSION_KEY, '1')
    setPinInput('')
    setPinEnabled(true)
    toast.success('PIN lock enabled')
  }

  const handleEnableBiometric = async () => {
    setBiometricRegistering(true)
    const ok = await registerBiometric()
    setBiometricRegistering(false)
    if (ok) {
      setBiometricEnabled(true)
      toast.success('Biometric unlock enabled')
    } else {
      toast.error('Biometric setup failed — try again or use PIN only')
    }
  }

  const handleDisableBiometric = () => {
    localStorage.removeItem(BIOMETRIC_CRED_KEY)
    setBiometricEnabled(false)
    toast.success('Biometric unlock removed')
  }

  const handleDisablePin = () => {
    localStorage.removeItem(PIN_STORAGE_KEY)
    localStorage.removeItem(BIOMETRIC_CRED_KEY)
    sessionStorage.removeItem(PIN_SESSION_KEY)
    setPinEnabled(false)
    setBiometricEnabled(false)
    toast.success('PIN lock removed')
  }

  const handleStartTotpSetup = async () => {
    const secret = await generateTOTPSecret()
    setTotpSecret(secret)
    setTotpSetup(true)
    const email = session?.user.email || 'user@finpath.app'
    try {
      // Local QR generation — the secret never leaves the device.
      const qrDataUrl = await generateTOTPQRCode(secret, email)
      setTotpQRCode(qrDataUrl)
    } catch (err) {
      console.warn('TOTP QR generation failed — manual entry below still works', err)
    }
  }

  const handleVerifyAndEnableTOTP = async () => {
    if (totpToken.length !== 6) {
      toast.error('Enter 6-digit code')
      return
    }
    setTotpVerifying(true)
    const valid = await verifyTOTP(totpSecret, totpToken)
    setTotpVerifying(false)
    if (valid) {
      localStorage.setItem('finpath_totp_secret', totpSecret)
      setTotpEnabled(true)
      setTotpSetup(false)
      setTotpToken('')
      setTotpSecret('')
      setTotpQRCode('')
      toast.success('Two-factor authentication enabled')
      if (!localStorage.getItem(PIN_STORAGE_KEY)) {
        toast.warning('Set a PIN lock too — 2FA applies when the app unlocks')
      }
    } else {
      toast.error('Invalid code — try again')
    }
  }

  const handleDisableTOTP = () => {
    localStorage.removeItem('finpath_totp_secret')
    setTotpEnabled(false)
    toast.success('Two-factor authentication disabled')
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
      await addCategory.mutateAsync({
        name,
        yearly_allocated: 0,
        budget_period: 'monthly',
        color: '#A9F5C7',
        icon: newCategoryIcon.trim() || null,
      })
      setNewCategory('')
      setNewCategoryIcon('')
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

  const handleStartRename = (id: string, name: string, icon: string | null) => {
    setEditingCategoryId(id)
    setEditingCategoryName(name)
    setEditingCategoryIcon(icon ?? '')
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
      await renameCategory.mutateAsync({ id: editingCategoryId, name: trimmed, icon: editingCategoryIcon.trim() || null })
      setEditingCategoryId(null)
      toast.success('Category updated')
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
    const initBalance = walletInitBalance ? parseNumberInput(walletInitBalance) : 0
    try {
      await addWallet.mutateAsync({
        name,
        type: walletType,
        balance: initBalance,
        monthly_limit: parseNumberInput(walletMonthlyLimit) || 0,
        currency: baseCurrency,
        cash_role: walletType === 'cash' && walletCashRole ? walletCashRole : null,
      })
      setWalletName('')
      setWalletType('cash')
      setWalletCashRole('')
      setWalletInitBalance('')
      setWalletMonthlyLimit('')
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
    const limit = parseNumberInput(editingWalletLimit) || 0
    try {
      if (wallet?.type === 'cash') {
        await updateWallet.mutateAsync({ id: editingWalletId, name: trimmed, cash_role: editingWalletCashRole || null, monthly_limit: limit })
      } else {
        await renameWallet.mutateAsync({ id: editingWalletId, name: trimmed, monthly_limit: limit })
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
      const cat = categories.find(c => c.id === confirmDelete.id)
      deleteCategory.mutate(confirmDelete.id)
      toast.success('Category removed', {
        action: {
          label: 'Undo',
          onClick: async () => {
            if (!cat) return
            try {
              await addCategory.mutateAsync({ name: cat.name, yearly_allocated: cat.yearly_allocated, budget_period: cat.budget_period, color: cat.color, icon: cat.icon ?? null })
              toast.success('Category restored')
            } catch { toast.error('Failed to restore category') }
          },
        },
      })
    } else {
      const w = wallets.find(x => x.id === confirmDelete.id)
      deleteWallet.mutate(confirmDelete.id)
      toast.success('Wallet removed', {
        action: {
          label: 'Undo',
          onClick: async () => {
            if (!w) return
            try {
              await addWallet.mutateAsync({ name: w.name, type: w.type, currency: w.currency, balance: w.balance, cash_role: w.cash_role ?? null, monthly_limit: w.monthly_limit ?? 0 })
              toast.success('Wallet restored')
            } catch { toast.error('Failed to restore wallet') }
          },
        },
      })
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
    a.download = `finpath-backup-${todayLocal()}.json`
    a.click()
    URL.revokeObjectURL(url)
    const today = todayLocal()
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
    const data = backupPreview ? (backupPreview.parsed as Record<string, unknown>[]) : JSON.parse(backupText)

    // Duplicate protection — importing the same backup twice must not double data.
    const existingWalletNames = new Set(wallets.map(w => w.name.toLowerCase()))
    const existingCategoryNames = new Set(categories.map(c => c.name.toLowerCase()))
    const existingTxKeys = new Set(
      transactions.map(t => `${String(t.description ?? '').toLowerCase()}|${t.amount}|${t.date}|${t.type}`)
    )

    let addedWallets = 0, addedCategories = 0, addedTx = 0, skipped = 0
    const skip = () => { skipped++ }
    for (const wallet of (data.wallets as Record<string, unknown>[] ?? [])) {
      if (existingWalletNames.has(String(wallet.name ?? '').toLowerCase())) { skip(); continue }
      await addWallet.mutateAsync(stripSystemFields(wallet) as Parameters<typeof addWallet.mutateAsync>[0])
      addedWallets++
    }
    for (const category of (data.budget_categories as Record<string, unknown>[] ?? [])) {
      if (existingCategoryNames.has(String(category.name ?? '').toLowerCase())) { skip(); continue }
      await addCategory.mutateAsync(stripSystemFields(category) as Parameters<typeof addCategory.mutateAsync>[0])
      addedCategories++
    }
    if (data.investment_config) await saveInvestmentConfig.mutateAsync(stripSystemFields(data.investment_config as Record<string, unknown>))
    for (const plan of (data.estimation_plans as Record<string, unknown>[] ?? [])) await upsertEstimationPlan.mutateAsync(stripSystemFields(plan) as Parameters<typeof upsertEstimationPlan.mutateAsync>[0])
    for (const tx of (data.transactions as Record<string, unknown>[] ?? [])) {
      const key = `${String(tx.description ?? '').toLowerCase()}|${tx.amount}|${tx.date}|${tx.type}`
      if (existingTxKeys.has(key)) { skip(); continue }
      await addTransaction.mutateAsync(stripSystemFields(tx) as Parameters<typeof addTransaction.mutateAsync>[0])
      addedTx++
    }
    setBackupPreview(null)
    setBackupText('')
    if (skipped > 0) {
      toast.success(`Backup imported — ${addedWallets} wallets, ${addedCategories} categories, ${addedTx} transactions · ${skipped} skipped as duplicates`)
    } else {
      toast.success('Backup imported successfully')
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={<><span className="hidden sm:inline">Manage your profile, login, currency, and spending categories.</span><span className="sm:hidden">Profile, security, and preferences.</span></>}
      />
      {!session && (
        <div className="mb-2 flex items-start gap-3 rounded-2xl border border-[#FFCF73]/30 bg-[#FFCF73]/5 px-4 py-3.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FFCF73]" />
          <div>
            <p className="font-bold text-[#FFCF73]">Guest mode — data is not saved to the cloud</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Your budgets, wallets, and transactions are stored in this browser only. Log in to keep your data safe and sync across devices.</p>
          </div>
        </div>
      )}

      {/* Desktop: pill tab bar */}
      <div className="mb-2 hidden flex-wrap gap-2 overflow-x-auto lg:flex">
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
        <div className="mb-2 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 lg:hidden">
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
        <div className="mb-2 flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 lg:hidden">
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
        <div className="mb-2 overflow-hidden rounded-2xl border border-border bg-card lg:hidden">
          {tabs.map((tab) => {
            const { label, desc, Icon, color } = TAB_META[tab]
            return (
              <button
                key={tab}
                onClick={() => {
                  setMobilePage(tab)
                  setSearchParams({ section: tab })
                }}
                className="flex w-full items-center gap-2 border-b border-border px-4 py-3.5 text-left transition-colors active:bg-muted/40"
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
          <Link
            to="/desktop-tools"
            className="flex w-full items-center gap-2 px-4 py-3.5 text-left transition-colors active:bg-muted/40"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C4AEFF]/20">
              <Sparkles className="h-5 w-5 text-[#C4AEFF]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-foreground">Desktop tools</p>
              <p className="text-xs text-muted-foreground">AI, Investing & Planning — open on a larger screen</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </div>
      )}

      {/* Mobile: back button when a page is selected */}
      {effectiveTab && !isDesktop && (
        <button
          onClick={() => {
            setMobilePage(null)
            setSearchParams({})
          }}
          className="mb-2 flex items-center gap-2 text-sm font-bold text-primary lg:hidden"
        >
          <ChevronLeft className="h-4 w-4" />
          Settings
        </button>
      )}

      {/* Profile tab */}
      {effectiveTab === 'profile' && (
        <>
          <Card className="mb-2">
            <CardContent className="flex min-h-[156px] flex-col items-start gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-2">
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
            <Card className="mb-2">
              <CardContent className="grid grid-cols-1 items-end gap-2 p-4 sm:p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <Label className="text-sm text-muted-foreground">Name</Label>
                  <Input aria-label="Profile name" value={name} onChange={event => setName(event.target.value)} className="mt-2 bg-secondary" />
                </div>
                <Button onClick={saveProfile} disabled={saveSettings.isPending}>Save</Button>
              </CardContent>
            </Card>
          )}
          <Card className="mb-2">
            <CardHeader>
              <CardTitle className="text-xl">Account access</CardTitle>
              <p className="text-sm text-muted-foreground">Log in or create an account to keep your data safe. You can also use the profile icon in the sidebar.</p>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-3 sm:px-6 sm:pb-3">
              {session ? (
                <div className="flex flex-col gap-2 rounded-2xl border border-border bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-foreground">Logged in</p>
                    <p className="text-sm text-muted-foreground">{session.user.email}</p>
                  </div>
                  <Button variant="secondary" disabled={signOut.isPending} onClick={handleSignOut}>Log out</Button>
                </div>
              ) : (
                <div className="grid max-w-md grid-cols-1 items-end gap-2">
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
          <Card className="mb-2 border-[#FF8388]/30">
            <CardHeader>
              <CardTitle className="text-xl text-[#FF8388]">Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-3 sm:px-6 sm:pb-3">
              {session ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Deletes your account and <strong>every</strong> wallet, transaction, budget, goal, subscription and snapshot stored on the server. This cannot be undone.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      aria-label="Type DELETE to confirm"
                      className="sm:w-52"
                      value={deleteConfirmText}
                      onChange={event => setDeleteConfirmText(event.target.value)}
                      placeholder="Type DELETE"
                    />
                    <Button
                      variant="destructive"
                      disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                      onClick={handleDeleteAccount}
                    >
                      {deletingAccount ? 'Deleting…' : 'Delete account & all data'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Guest mode keeps everything on this device. Clear it to start completely fresh.
                  </p>
                  <div>
                    <Button variant="destructive" onClick={handleClearGuestData}>Clear all local data</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <Card className="mb-2">
            <CardHeader><CardTitle className="text-xl">Currency</CardTitle></CardHeader>
            <CardContent className="space-y-2 px-4 pb-3 sm:px-6 sm:pb-3">
              <p className="text-sm text-muted-foreground">All amounts are stored and displayed in your <strong>main currency</strong> — numbers never change due to exchange rate drift.</p>

              {/* Currency status banner */}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-secondary px-4 py-3">
                <p className="text-xs font-bold text-muted-foreground">Current currency: <span className="text-foreground">{money.baseCurrency}</span></p>
                <p className="text-right text-xs text-muted-foreground">
                  {money.ratesDate ? `Rates: ${money.ratesDate}` : <span className="text-[#FFCF73]">Using fallback rates</span>}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Main currency <span className="font-normal">(all amounts stored and shown in this)</span></Label>
                <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                  <SelectTrigger aria-label="Main currency" className="h-12 rounded-2xl bg-secondary font-extrabold">
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
          <div className="mb-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
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
          <div className="mb-2 rounded-2xl border border-border bg-card p-4">
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
        <Card className="mb-2">
          <CardHeader>
            <CardTitle className="text-xl">Wallets</CardTitle>
            <p className="text-sm text-muted-foreground">Add cash wallets, bank accounts, cards, and e-wallets for transaction tracking.</p>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-3 sm:px-6 sm:pb-3">
            {!showAddWallet ? (
              <Button variant="secondary" className="w-full" onClick={() => setShowAddWallet(true)}>+ Add wallet</Button>
            ) : (
            <div className="space-y-2 rounded-2xl border border-border bg-secondary/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold text-foreground">New wallet</p>
                <button onClick={() => setShowAddWallet(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
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

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                <Input
                  aria-label="Wallet name"
                  className="bg-background"
                  value={walletName}
                  onChange={event => setWalletName(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleAddWallet()}
                  placeholder={`Name — e.g. ${WALLET_NAME_HINTS[walletType] ?? 'My wallet'}`}
                />
                <Input
                  aria-label="Monthly limit (optional)"
                  className="bg-background sm:w-28"
                  value={walletMonthlyLimit}
                  onChange={event => setWalletMonthlyLimit(formatNumberInput(event.target.value))}
                  inputMode="numeric"
                  placeholder="Limit/mo"
                />
                <div onKeyDown={event => event.key === 'Enter' && handleAddWallet()}>
                  <MoneyField
                    value={walletInitBalance}
                    onChange={v => setWalletInitBalance(formatNumberInput(v))}
                    currency={money.displayCurrency}
                    ariaLabel="Initial balance (optional)"
                    className="bg-background sm:w-32"
                    placeholder="Balance (opt.)"
                  />
                </div>
                <Button onClick={handleAddWallet} disabled={addWallet.isPending || !walletName.trim()}>Add wallet</Button>
              </div>
            </div>
            )}
            <div className="space-y-2 pr-1">
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
                              <input
                                aria-label="Edit monthly limit"
                                className="w-24 shrink-0 rounded-lg border border-border bg-background px-2 py-1 text-sm font-bold text-foreground outline-none focus:border-primary"
                                value={editingWalletLimit}
                                onChange={e => setEditingWalletLimit(formatNumberInput(e.target.value))}
                                inputMode="numeric"
                                placeholder="Limit/mo"
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
                              {(wallet.monthly_limit ?? 0) > 0 && (
                                <span className="ml-2 rounded-full bg-[#FFCF73]/15 px-2 py-0.5 text-[10px] font-bold text-[#FFCF73]">
                                  ≤ {money.formatDisplay(wallet.monthly_limit!)}/mo
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 font-extrabold text-foreground">{money.formatDisplay(walletBalances.get(wallet.id) ?? 0)}</span>
                            <button
                              aria-label={`Rename ${wallet.name} wallet`}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-primary"
                              onClick={() => { setEditingWalletId(wallet.id); setEditingWalletName(wallet.name); setEditingWalletCashRole(wallet.cash_role ?? ''); setEditingWalletLimit(String(wallet.monthly_limit ?? '')) }}
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
        <Card className="mb-2">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-xl">Category manager</CardTitle>
              <Button variant="secondary" onClick={handleAddStarterCategories} disabled={addCategory.isPending}>
                Restore starter categories
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-3 sm:px-6 sm:pb-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {categories.map(category => (
                <div
                  key={category.id}
                  className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border bg-secondary px-3 py-2"
                >
                  <span className="min-w-0 truncate font-bold text-foreground">
                    {category.icon && <span className="mr-1.5">{category.icon}</span>}
                    {category.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label={"Edit " + category.name + " category"}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/60 hover:text-primary"
                      onClick={() => handleStartRename(category.id, category.name, category.icon ?? null)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={"Delete " + category.name + " category"}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/60 hover:text-destructive"
                      onClick={() => handleDeleteCategory(category.id, category.name)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Edit category sheet */}
            <Sheet open={editingCategoryId !== null} onOpenChange={v => { if (!v) setEditingCategoryId(null) }}>
              <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl border-border bg-background px-5 pb-safe-10">
                <SheetHeader className="mb-3 text-left">
                  <SheetTitle>Edit category</SheetTitle>
                </SheetHeader>
                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Icon</p>
                    <EmojiPicker value={editingCategoryIcon} onChange={setEditingCategoryIcon} ariaLabel="Category icon choices" />
                    <Input
                      aria-label="Edit category icon"
                      className="mt-2 w-16 bg-secondary text-center text-lg"
                      value={editingCategoryIcon}
                      onChange={e => setEditingCategoryIcon(e.target.value.slice(0, 4))}
                      placeholder="🍔"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Name</p>
                    <Input
                      aria-label="Edit category name"
                      className="bg-secondary"
                      value={editingCategoryName}
                      onChange={e => setEditingCategoryName(e.target.value)}
                      placeholder="Category name"
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") handleSaveRename() }}
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button className="flex-1" onClick={handleSaveRename} disabled={renameCategory.isPending}>Save</Button>
                    <Button variant="secondary" onClick={() => setEditingCategoryId(null)}>Cancel</Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {editingCategoryId && (
              <div className="max-w-xl space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground">Choose an icon</p>
                <EmojiPicker value={editingCategoryIcon} onChange={setEditingCategoryIcon} ariaLabel="Category icon choices" />
              </div>
            )}
            <div className="max-w-xl space-y-2">
              <EmojiPicker value={newCategoryIcon} onChange={setNewCategoryIcon} ariaLabel="New category icon choices" />
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  aria-label="Category icon"
                  className="w-16 shrink-0 bg-secondary text-center text-lg"
                  value={newCategoryIcon}
                  onChange={event => setNewCategoryIcon(event.target.value.slice(0, 4))}
                  placeholder="🍔"
                />
                <Input
                  className="bg-secondary"
                  value={newCategory}
                  onChange={event => setNewCategory(event.target.value)}
                  onKeyDown={event => event.key === 'Enter' && handleAddCategory()}
                  placeholder="New category"
                />
                <Button onClick={handleAddCategory} disabled={addCategory.isPending}>Add</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Security tab */}
      {effectiveTab === 'security' && (
        <Card className="mb-2">
          <CardHeader>
            <CardTitle className="text-xl">PIN lock</CardTitle>
            <p className="text-sm text-muted-foreground">Protect this browser session with a 4-digit PIN. PIN lock is not a replacement for account security — it only locks this device's screen.</p>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-3 sm:px-6 sm:pb-3">
            {pinEnabled ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
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

            {/* Biometric unlock */}
            {pinEnabled && (
              <div className="rounded-2xl border border-border bg-secondary p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-foreground">Biometric unlock</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Use fingerprint or face ID instead of PIN</p>
                  </div>
                  {biometricEnabled ? (
                    <Button variant="secondary" size="sm" onClick={handleDisableBiometric}>Remove</Button>
                  ) : (
                    <Button size="sm" onClick={handleEnableBiometric} disabled={biometricRegistering}>
                      {biometricRegistering ? 'Setting up…' : 'Set up'}
                    </Button>
                  )}
                </div>
                {biometricEnabled && (
                  <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <p className="text-xs font-bold text-primary">Biometric unlock active</p>
                  </div>
                )}
              </div>
            )}

            {/* Two-factor authentication (TOTP) */}
            <div className="rounded-2xl border border-border bg-secondary p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-foreground">Two-factor authentication</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Require an authenticator code each time the app unlocks</p>
                </div>
                {totpEnabled ? (
                  <Button variant="secondary" size="sm" onClick={handleDisableTOTP}>Remove</Button>
                ) : (
                  <Button size="sm" onClick={handleStartTotpSetup} disabled={totpSetup}>
                    {totpSetup ? 'Setting up...' : 'Set up'}
                  </Button>
                )}
              </div>
              {totpEnabled && (
                <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <p className="text-xs font-bold text-primary">2FA enabled</p>
                </div>
              )}
              {totpSetup && totpQRCode && (
                <div className="space-y-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">1. Scan this QR code with an authenticator app:</p>
                  <img src={totpQRCode} alt="TOTP QR Code" className="h-48 w-48 rounded-lg border border-border" />
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">2. Or enter manually:</p>
                    <code className="block rounded bg-background px-3 py-2 font-mono text-sm text-foreground">{totpSecret}</code>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">3. Enter 6-digit code to confirm</Label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={totpToken}
                        onChange={e => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-24 text-center"
                      />
                      <Button size="sm" onClick={handleVerifyAndEnableTOTP} disabled={totpToken.length !== 6 || totpVerifying}>
                        {totpVerifying ? 'Verifying...' : 'Verify'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setTotpSetup(false)
                          setTotpToken('')
                          setTotpSecret('')
                          setTotpQRCode('')
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

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
        <Card className="mb-2">
          <CardHeader>
            <CardTitle className="text-xl">Data Safety</CardTitle>
            <p className="text-sm text-muted-foreground">Your data privacy and backup status at a glance.</p>
          </CardHeader>
          <CardContent className="px-4 pb-3 sm:px-6 sm:pb-3">
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
                    value: session ? (getQueue().length > 0 ? `${getQueue().length} pending` : 'Up to date') : 'Off (guest mode)',
                    status: session ? (getQueue().length > 0 ? 'warn' : 'ok') : 'info',
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
        <Card className="mb-2">
          <CardHeader>
            <CardTitle className="text-xl">Backup and restore</CardTitle>
            <p className="text-sm text-muted-foreground">Export your FinPath data as a JSON file, or upload a previous backup to restore it.</p>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-3 sm:px-6 sm:pb-3">
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

      {/* AI Features tab */}
      {effectiveTab === 'ai' && (
        <Card className="mb-2">
          <CardHeader>
            <CardTitle className="text-xl">AI Features</CardTitle>
            <p className="text-sm text-muted-foreground">
              Paste your Gemini API key to enable AI insights and receipt scanning. The key is stored on this device and
              sent only to Google's Gemini API. Uninstalling the app clears the saved key.
            </p>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-3 sm:px-6 sm:pb-3">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-secondary px-4 py-3">
              <p className="text-xs font-bold text-muted-foreground">
                AI status: <span className={aiConfigured ? 'text-primary' : 'text-foreground'}>{aiConfigured ? 'Configured' : 'Not configured'}</span>
              </p>
            </div>
            <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label className="text-sm text-muted-foreground">Gemini API key</Label>
                <Input
                  aria-label="Gemini API key"
                  className="mt-2 bg-secondary font-mono"
                  type="password"
                  value={geminiKey}
                  onChange={event => setGeminiKey(event.target.value)}
                  placeholder="Paste your key — e.g. AIza…"
                />
              </div>
              <Button onClick={() => handleSaveAiKey()}>Save key</Button>
              {aiConfigured && (
                <Button variant="secondary" onClick={() => handleSaveAiKey('')}>Remove key</Button>
              )}
            </div>
          </CardContent>
        </Card>
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
