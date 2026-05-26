import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type {
  Transaction, BudgetCategory, BudgetRule,
  InvestmentConfig, EstimationPlan, AppSettings,
} from '../types'

// ── Transactions ──────────────────────────────────────────────
export function useTransactions(filter = 'all') {
  return useQuery({
    queryKey: ['transactions', filter],
    queryFn: async () => {
      let q = supabase.from('transactions').select('*').order('date', { ascending: false })
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
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useAddTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (transaction: Omit<Transaction, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('transactions').insert(transaction).select().single()
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
      const { error } = await supabase.from('transactions').update({ needs_review: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

// ── Budget Categories ─────────────────────────────────────────
export function useBudgetCategories() {
  return useQuery({
    queryKey: ['budget_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('budget_categories').select('*').order('name')
      if (error) throw error
      return data as BudgetCategory[]
    },
  })
}

export function useAddBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cat: Omit<BudgetCategory, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('budget_categories').insert(cat).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useDeleteBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('budget_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useUpdateBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, yearly_allocated, color }: Pick<BudgetCategory, 'id' | 'yearly_allocated' | 'color'>) => {
      const { error } = await supabase
        .from('budget_categories')
        .update({ yearly_allocated, color })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

// ── Budget Rules ──────────────────────────────────────────────
export function useBudgetRules() {
  return useQuery({
    queryKey: ['budget_rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('budget_rules').select('*')
      if (error) throw error
      return data as BudgetRule[]
    },
  })
}

// ── Investment Config ─────────────────────────────────────────
export function useInvestmentConfig() {
  return useQuery({
    queryKey: ['investment_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('investment_config').select('*').limit(1).maybeSingle()
      if (error) throw error
      return data as InvestmentConfig | null
    },
  })
}

export function useUpdateInvestmentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Omit<InvestmentConfig, 'created_at'>> & { id: string }) => {
      const { error } = await supabase.from('investment_config').update(rest).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['investment_config'] }),
  })
}

export function useSaveInvestmentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (config: Partial<Omit<InvestmentConfig, 'created_at'>>) => {
      const { id, ...payload } = config
      const { data, error } = id
        ? await supabase.from('investment_config').update(payload).eq('id', id).select().single()
        : await supabase.from('investment_config').insert(payload).select().single()
      if (error) throw error
      return data as InvestmentConfig
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['investment_config'] }),
  })
}

// ── Estimation Plans ──────────────────────────────────────────
export function useEstimationPlans() {
  return useQuery({
    queryKey: ['estimation_plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estimation_plans')
        .select('*')
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
      const { data, error } = await supabase.from('estimation_plans').upsert(plan).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['estimation_plans'] }),
  })
}

// ── App Settings ──────────────────────────────────────────────
export function useAppSettings() {
  return useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*').limit(1).maybeSingle()
      if (error) throw error
      return data as AppSettings | null
    },
  })
}

export function useUpdateAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Omit<AppSettings, 'created_at'>> & { id: string }) => {
      const { error } = await supabase.from('app_settings').update(rest).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_settings'] }),
  })
}

export function useSaveAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settings: Partial<Omit<AppSettings, 'created_at'>>) => {
      const { id, ...payload } = settings
      const { error } = id
        ? await supabase.from('app_settings').update(payload).eq('id', id)
        : await supabase.from('app_settings').insert(payload)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_settings'] }),
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
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth_session'] }),
  })
}

export function useSignUp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth_session'] }),
  })
}

export function useSignOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth_session'] }),
  })
}
