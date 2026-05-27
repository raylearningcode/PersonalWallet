import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type {
  AppSettings,
  BudgetCategory,
  BudgetRule,
  EstimationPlan,
  InvestmentConfig,
  Transaction,
  Wallet,
} from '../types'

const accountQueryKeys = [
  ['transactions'],
  ['wallets'],
  ['budget_categories'],
  ['budget_rules'],
  ['investment_config'],
  ['estimation_plans'],
  ['app_settings'],
]

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session?.user.id ?? null
}

function clearSignedOutFlag() {
  if (typeof window !== 'undefined') localStorage.removeItem('finpath_signed_out')
}

function markSignedOut() {
  if (typeof window !== 'undefined') localStorage.setItem('finpath_signed_out', '1')
}

function invalidateAccountQueries(qc: ReturnType<typeof useQueryClient>) {
  accountQueryKeys.forEach(queryKey => qc.invalidateQueries({ queryKey }))
}

async function requireUserId(action: string) {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error(`Log in before ${action}.`)
  return userId
}

async function claimLegacyAccountData(userId: string) {
  const tables = [
    'app_settings',
    'wallets',
    'budget_categories',
    'budget_rules',
    'investment_config',
    'estimation_plans',
    'transactions',
  ]
  for (const table of tables) {
    const { error } = await supabase.from(table).update({ user_id: userId }).is('user_id', null)
    if (error) throw error
  }
}

export function useTransactions(filter = 'all') {
  return useQuery({
    queryKey: ['transactions', filter],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return []
      let q = supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false })
      if (filter === 'needs_review') q = q.eq('needs_review', true)
      else if (filter !== 'all') q = q.eq('type', filter)
      const { data, error } = await q
      if (error) throw error
      return data as Transaction[]
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await requireUserId('deleting transactions')
      const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useAddTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (transaction: Omit<Transaction, 'id' | 'created_at'>) => {
      const userId = await requireUserId('adding transactions')
      const { data, error } = await supabase.from('transactions').insert({ ...transaction, user_id: userId }).select().single()
      if (error) throw error
      return data as Transaction
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...transaction }: Partial<Omit<Transaction, 'created_at'>> & { id: string }) => {
      const userId = await requireUserId('editing transactions')
      const { data, error } = await supabase
        .from('transactions')
        .update(transaction)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) throw error
      return data as Transaction
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useMarkReviewed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await requireUserId('reviewing transactions')
      const { error } = await supabase.from('transactions').update({ needs_review: false }).eq('id', id).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useWallets() {
  return useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return []
      const { data, error } = await supabase.from('wallets').select('*').eq('user_id', userId).order('created_at')
      if (error) throw error
      return data as Wallet[]
    },
  })
}

export function useAddWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (wallet: Omit<Wallet, 'id' | 'created_at'>) => {
      const userId = await requireUserId('adding wallets')
      const { data, error } = await supabase.from('wallets').insert({ ...wallet, user_id: userId }).select().single()
      if (error) throw error
      return data as Wallet
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallets'] }),
  })
}

export function useDeleteWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await requireUserId('deleting wallets')
      const { error } = await supabase.from('wallets').delete().eq('id', id).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallets'] }),
  })
}

export function useBudgetCategories() {
  return useQuery({
    queryKey: ['budget_categories'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return []
      const { data, error } = await supabase.from('budget_categories').select('*').eq('user_id', userId).order('name')
      if (error) throw error
      return data as BudgetCategory[]
    },
  })
}

export function useAddBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cat: Omit<BudgetCategory, 'id' | 'created_at' | 'budget_period'> & Partial<Pick<BudgetCategory, 'budget_period'>>) => {
      const userId = await requireUserId('adding categories')
      const { data, error } = await supabase
        .from('budget_categories')
        .insert({ budget_period: 'monthly', ...cat, user_id: userId })
        .select()
        .single()
      if (error) throw error
      return data as BudgetCategory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useDeleteBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await requireUserId('deleting categories')
      const { error } = await supabase.from('budget_categories').delete().eq('id', id).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useUpdateBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, yearly_allocated, budget_period, color }: Pick<BudgetCategory, 'id' | 'yearly_allocated' | 'budget_period' | 'color'>) => {
      const userId = await requireUserId('editing categories')
      const { error } = await supabase
        .from('budget_categories')
        .update({ yearly_allocated, budget_period, color })
        .eq('id', id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useBudgetRules() {
  return useQuery({
    queryKey: ['budget_rules'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return []
      const { data, error } = await supabase.from('budget_rules').select('*').eq('user_id', userId)
      if (error) throw error
      return data as BudgetRule[]
    },
  })
}

export function useAddBudgetRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rule: Omit<BudgetRule, 'id' | 'created_at'>) => {
      const userId = await requireUserId('adding budget rules')
      const { data, error } = await supabase.from('budget_rules').insert({ ...rule, user_id: userId }).select().single()
      if (error) throw error
      return data as BudgetRule
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_rules'] }),
  })
}

export function useDeleteBudgetRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await requireUserId('deleting budget rules')
      const { error } = await supabase.from('budget_rules').delete().eq('id', id).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_rules'] }),
  })
}

export function useInvestmentConfig() {
  return useQuery({
    queryKey: ['investment_config'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return null
      const { data, error } = await supabase.from('investment_config').select('*').eq('user_id', userId).limit(1).maybeSingle()
      if (error) throw error
      return data as InvestmentConfig | null
    },
  })
}

export function useUpdateInvestmentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Omit<InvestmentConfig, 'created_at'>> & { id: string }) => {
      const userId = await requireUserId('editing investing settings')
      const { error } = await supabase.from('investment_config').update(rest).eq('id', id).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['investment_config'] }),
  })
}

export function useSaveInvestmentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (config: Partial<Omit<InvestmentConfig, 'created_at'>>) => {
      const userId = await requireUserId('saving investing settings')
      const { id, ...payload } = config
      const { data, error } = id
        ? await supabase.from('investment_config').update(payload).eq('id', id).eq('user_id', userId).select().single()
        : await supabase.from('investment_config').insert({ ...payload, user_id: userId }).select().single()
      if (error) throw error
      return data as InvestmentConfig
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['investment_config'] }),
  })
}

export function useEstimationPlans() {
  return useQuery({
    queryKey: ['estimation_plans'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return []
      const { data, error } = await supabase
        .from('estimation_plans')
        .select('*')
        .eq('user_id', userId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (error) throw error
      return data as EstimationPlan[]
    },
  })
}

export function useUpsertEstimationPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (plan: Omit<EstimationPlan, 'id' | 'created_at'>) => {
      const userId = await requireUserId('saving estimation plans')
      const { data, error } = await supabase
        .from('estimation_plans')
        .upsert({ ...plan, user_id: userId }, { onConflict: 'user_id,month,year' })
        .select()
        .single()
      if (error) throw error
      return data as EstimationPlan
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['estimation_plans'] }),
  })
}

export function useAppSettings() {
  return useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return null
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as AppSettings | null
    },
  })
}

export function useUpdateAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Omit<AppSettings, 'created_at'>> & { id: string }) => {
      const userId = await requireUserId('saving settings')
      const { error } = await supabase.from('app_settings').update(rest).eq('id', id).eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_settings'] }),
  })
}

export function useSaveAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settings: Partial<Omit<AppSettings, 'created_at'>>) => {
      const userId = await requireUserId('saving settings')
      const { id, ...payload } = settings
      let targetId = id

      if (!targetId) {
        const { data: existingSettings, error: lookupError } = await supabase
          .from('app_settings')
          .select('id')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (lookupError) throw lookupError
        targetId = existingSettings?.id
      }

      const query = targetId
        ? supabase.from('app_settings').update(payload).eq('id', targetId).eq('user_id', userId)
        : supabase.from('app_settings').insert({ ...payload, user_id: userId })
      const { data, error } = await query.select('*').single()
      if (error) throw error
      return data as AppSettings
    },
    onSuccess: data => {
      qc.setQueryData(['app_settings'], data)
      qc.invalidateQueries({ queryKey: ['app_settings'] })
    },
  })
}

export function useAuthSession() {
  return useQuery({
    queryKey: ['auth_session'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      return data.session
    },
  })
}

export function useSignIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      clearSignedOutFlag()
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth_session'] })
      invalidateAccountQueries(qc)
    },
  })
}

export function useSignUp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      if (data.user?.id && data.session) {
        await claimLegacyAccountData(data.user.id)
        clearSignedOutFlag()
      }
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth_session'] })
      invalidateAccountQueries(qc)
    },
  })
}

export function useSignOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      markSignedOut()
    },
    onSuccess: () => {
      qc.setQueryData(['auth_session'], null)
      qc.setQueryData(['transactions'], [])
      qc.setQueryData(['wallets'], [])
      qc.setQueryData(['budget_categories'], [])
      qc.setQueryData(['budget_rules'], [])
      qc.setQueryData(['investment_config'], null)
      qc.setQueryData(['estimation_plans'], [])
      qc.setQueryData(['app_settings'], null)
      invalidateAccountQueries(qc)
    },
  })
}
