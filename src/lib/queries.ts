import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import {
  fetchWithCache, cacheSet, cacheGet, cacheAddItem, cacheUpdateItem, cacheDeleteItem,
  enqueue, isOffline, isNetworkError,
} from './offlineCache'
import type {
  AppSettings,
  BudgetCategory,
  BudgetRule,
  EstimationPlan,
  Goal,
  InvestmentConfig,
  RecurringRule,
  Transaction,
  Wallet,
} from '../types'
import { getDueRecurringOccurrences, getNextRecurringState } from './recurring'
import {
  localGetTransactions, localAddTransaction, localUpdateTransaction, localDeleteTransaction, localMarkReviewed,
  localGetWallets, localAddWallet, localDeleteWallet, localUpdateWallet,
  localGetCategories, localAddCategory, localUpdateCategory, localDeleteCategory,
  localGetRules, localAddRule, localUpdateRule, localDeleteRule, localRunDueRules,
  localGetSettings, localSaveSettings,
  localGetInvestment, localSaveInvestment,
  localGetPlans, localUpsertPlan,
  localGetGoals, localAddGoal, localUpdateGoal, localDeleteGoal,
  hasGuestData, clearGuestData, getGuestDataForMigration,
} from './localStore'

const accountQueryKeys = [
  ['transactions'],
  ['recurring_rules'],
  ['wallets'],
  ['budget_categories'],
  ['budget_rules'],
  ['investment_config'],
  ['estimation_plans'],
  ['app_settings'],
  ['goals'],
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

async function migrateGuestDataToAccount(userId: string): Promise<number> {
  const guestData = getGuestDataForMigration()
  const { transactions, wallets, categories, rules, plans, goals, investment } = guestData
  const strip = <T extends { user_id?: string | null; created_at?: string }>(
    items: T[]
  ): (Omit<T, 'user_id'> & { user_id: string })[] =>
    items.map(({ user_id: _uid, ...rest }) => ({ ...rest, user_id: userId } as Omit<T, 'user_id'> & { user_id: string }))

  // Backup guest data before migration so it can be recovered if something goes wrong
  localStorage.setItem('finpath_guest_backup_before_migration', JSON.stringify(guestData))

  // Check every insert for errors — only clear guest data after all succeed
  if (wallets.length) {
    const { error } = await supabase.from('wallets').insert(strip(wallets))
    if (error) throw error
  }
  if (categories.length) {
    const { error } = await supabase.from('budget_categories').insert(strip(categories))
    if (error) throw error
  }
  if (rules.length) {
    const { error } = await supabase.from('recurring_rules').insert(strip(rules))
    if (error) throw error
  }
  if (transactions.length) {
    const { error } = await supabase.from('transactions').insert(strip(transactions))
    if (error) throw error
  }
  if (plans.length) {
    const { error } = await supabase.from('estimation_plans').insert(strip(plans))
    if (error) throw error
  }
  if (goals.length) {
    const { error } = await supabase.from('goals').insert(strip(goals))
    if (error) throw error
  }
  if (investment) {
    const { user_id: _uid, id: _id, created_at: _ca, ...inv } = investment
    const { error } = await supabase.from('investment_config').insert({ ...inv, user_id: userId })
    if (error) throw error
  }

  clearGuestData()
  return wallets.length + categories.length + rules.length + transactions.length + plans.length + goals.length + (investment ? 1 : 0)
}

export function useTransactions(filter = 'all') {
  return useQuery({
    queryKey: ['transactions', filter],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) {
        let txs = localGetTransactions()
        if (filter === 'needs_review') txs = txs.filter(t => t.needs_review)
        else if (filter !== 'all') txs = txs.filter(t => t.type === filter)
        return txs.sort((a, b) => b.date.localeCompare(a.date))
      }
      const cacheKey = `transactions_${filter}`
      return fetchWithCache<Transaction[]>(cacheKey, async () => {
        let q = supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false })
        if (filter === 'needs_review') q = q.eq('needs_review', true)
        else if (filter !== 'all') q = q.eq('type', filter)
        const { data, error } = await q
        if (error) throw error
        return data as Transaction[]
      }, [])
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await getCurrentUserId()
      if (!userId) { localDeleteTransaction(id); return }
      if (isOffline()) {
        for (const f of ['all', 'income', 'expense', 'transfer', 'needs_review'])
          cacheDeleteItem(`transactions_${f}`, id)
        enqueue({ table: 'transactions', op: 'delete', matchId: id, userId })
        return
      }
      try {
        const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', userId)
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) {
          for (const f of ['all', 'income', 'expense', 'transfer', 'needs_review'])
            cacheDeleteItem(`transactions_${f}`, id)
          enqueue({ table: 'transactions', op: 'delete', matchId: id, userId })
          return
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useAddTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (transaction: Omit<Transaction, 'id' | 'created_at'>) => {
      const userId = await getCurrentUserId()
      if (!userId) return localAddTransaction(transaction)
      const tempId = crypto.randomUUID()
      const tempItem: Transaction = { ...transaction, id: tempId, user_id: userId, created_at: new Date().toISOString() }
      if (isOffline()) {
        cacheAddItem('transactions_all', tempItem)
        if (transaction.type) cacheAddItem(`transactions_${transaction.type}`, tempItem)
        enqueue({ table: 'transactions', op: 'insert', data: { ...transaction, user_id: userId, id: tempId }, userId })
        return tempItem
      }
      try {
        const { data, error } = await supabase.from('transactions').insert({ ...transaction, user_id: userId }).select().single()
        if (error) throw error
        const result = data as Transaction
        const existing = cacheGet<Transaction[]>('transactions_all') ?? []
        cacheSet('transactions_all', [result, ...existing])
        return result
      } catch (e) {
        if (isNetworkError(e)) {
          cacheAddItem('transactions_all', tempItem)
          if (transaction.type) cacheAddItem(`transactions_${transaction.type}`, tempItem)
          enqueue({ table: 'transactions', op: 'insert', data: { ...transaction, user_id: userId, id: tempId }, userId })
          return tempItem
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...transaction }: Partial<Omit<Transaction, 'created_at'>> & { id: string }) => {
      const userId = await getCurrentUserId()
      if (!userId) return localUpdateTransaction(id, transaction)
      if (isOffline()) {
        for (const f of ['all', 'income', 'expense', 'transfer', 'needs_review'])
          cacheUpdateItem(`transactions_${f}`, id, transaction)
        enqueue({ table: 'transactions', op: 'update', data: transaction as Record<string, unknown>, matchId: id, userId })
        return { id, ...transaction } as Transaction
      }
      try {
        const { data, error } = await supabase.from('transactions').update(transaction).eq('id', id).eq('user_id', userId).select().single()
        if (error) throw error
        return data as Transaction
      } catch (e) {
        if (isNetworkError(e)) {
          for (const f of ['all', 'income', 'expense', 'transfer', 'needs_review'])
            cacheUpdateItem(`transactions_${f}`, id, transaction)
          enqueue({ table: 'transactions', op: 'update', data: transaction as Record<string, unknown>, matchId: id, userId })
          return { id, ...transaction } as Transaction
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useMarkReviewed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await getCurrentUserId()
      if (!userId) { localMarkReviewed(id); return }
      if (isOffline()) {
        for (const f of ['all', 'income', 'expense', 'transfer', 'needs_review'])
          cacheUpdateItem(`transactions_${f}`, id, { needs_review: false })
        enqueue({ table: 'transactions', op: 'update', data: { needs_review: false }, matchId: id, userId })
        return
      }
      try {
        const { error } = await supabase.from('transactions').update({ needs_review: false }).eq('id', id).eq('user_id', userId)
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) {
          for (const f of ['all', 'income', 'expense', 'transfer', 'needs_review'])
            cacheUpdateItem(`transactions_${f}`, id, { needs_review: false })
          enqueue({ table: 'transactions', op: 'update', data: { needs_review: false }, matchId: id, userId })
          return
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

export function useRecurringRules() {
  return useQuery({
    queryKey: ['recurring_rules'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return [...localGetRules()].sort((a, b) => Number(b.active) - Number(a.active) || a.next_due_date.localeCompare(b.next_due_date))
      return fetchWithCache<RecurringRule[]>('recurring_rules', async () => {
        const { data, error } = await supabase
          .from('recurring_rules').select('*').eq('user_id', userId)
          .order('active', { ascending: false }).order('next_due_date', { ascending: true })
        if (error) throw error
        return data as RecurringRule[]
      }, [])
    },
  })
}

export function useAddRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rule: Omit<RecurringRule, 'id' | 'created_at'>) => {
      const userId = await getCurrentUserId()
      if (!userId) return localAddRule(rule)
      const tempId = crypto.randomUUID()
      const tempItem: RecurringRule = { ...rule, id: tempId, user_id: userId, created_at: new Date().toISOString() }
      if (isOffline()) {
        cacheAddItem('recurring_rules', tempItem)
        enqueue({ table: 'recurring_rules', op: 'insert', data: { ...rule, user_id: userId, id: tempId }, userId })
        return tempItem
      }
      try {
        const { data, error } = await supabase.from('recurring_rules').insert({ ...rule, user_id: userId }).select().single()
        if (error) throw error
        return data as RecurringRule
      } catch (e) {
        if (isNetworkError(e)) {
          cacheAddItem('recurring_rules', tempItem)
          enqueue({ table: 'recurring_rules', op: 'insert', data: { ...rule, user_id: userId, id: tempId }, userId })
          return tempItem
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring_rules'] }),
  })
}

export function useUpdateRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rule }: Partial<Omit<RecurringRule, 'created_at'>> & { id: string }) => {
      const userId = await getCurrentUserId()
      if (!userId) return localUpdateRule(id, rule)
      if (isOffline()) {
        cacheUpdateItem('recurring_rules', id, rule)
        enqueue({ table: 'recurring_rules', op: 'update', data: rule as Record<string, unknown>, matchId: id, userId })
        return { id, ...rule } as RecurringRule
      }
      try {
        const { data, error } = await supabase.from('recurring_rules').update(rule).eq('id', id).eq('user_id', userId).select().single()
        if (error) throw error
        return data as RecurringRule
      } catch (e) {
        if (isNetworkError(e)) {
          cacheUpdateItem('recurring_rules', id, rule)
          enqueue({ table: 'recurring_rules', op: 'update', data: rule as Record<string, unknown>, matchId: id, userId })
          return { id, ...rule } as RecurringRule
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring_rules'] }),
  })
}

export function useDeleteRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await getCurrentUserId()
      if (!userId) { localDeleteRule(id); return }
      if (isOffline()) {
        cacheDeleteItem('recurring_rules', id)
        enqueue({ table: 'recurring_rules', op: 'delete', matchId: id, userId })
        return
      }
      try {
        const { error } = await supabase.from('recurring_rules').delete().eq('id', id).eq('user_id', userId)
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) {
          cacheDeleteItem('recurring_rules', id)
          enqueue({ table: 'recurring_rules', op: 'delete', matchId: id, userId })
          return
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring_rules'] }),
  })
}

export function useRunDueRecurringRules() {
  const qc = useQueryClient()
  return useMutation<number, Error, string | undefined>({
    mutationFn: async today => {
      const runDate = today ?? new Date().toISOString().slice(0, 10)
      const userId = await getCurrentUserId()
      if (!userId) return localRunDueRules(runDate)
      const { data: rules, error } = await supabase
        .from('recurring_rules')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)
        .lte('next_due_date', runDate)
      if (error) throw error

      const generatedTransactions: Array<Omit<Transaction, 'id' | 'created_at'>> = []
      const ruleUpdates: Array<Partial<RecurringRule> & { id: string }> = []

      for (const rule of (rules ?? []) as RecurringRule[]) {
        const occurrences = getDueRecurringOccurrences(rule, runDate)
        occurrences.forEach(dueDate => {
          generatedTransactions.push({
            user_id: userId,
            description: rule.description,
            amount: rule.amount,
            original_amount: rule.original_amount,
            original_currency: rule.original_currency,
            type: rule.type,
            category: rule.category,
            wallet_id: rule.wallet_id ?? null,
            transfer_wallet_id: rule.transfer_wallet_id ?? null,
            recurring_rule_id: rule.id,
            recurring_due_date: dueDate,
            date: dueDate,
            needs_review: false,
          })
        })
        if (occurrences.length > 0) {
          ruleUpdates.push({ id: rule.id, ...getNextRecurringState(rule, occurrences.length) })
        }
      }

      if (generatedTransactions.length > 0) {
        const { error: insertError } = await supabase
          .from('transactions')
          .upsert(generatedTransactions, {
            onConflict: 'user_id,recurring_rule_id,recurring_due_date',
            ignoreDuplicates: true,
          })
        if (insertError) throw insertError
      }

      for (const { id, ...update } of ruleUpdates) {
        const { error: updateError } = await supabase
          .from('recurring_rules')
          .update(update)
          .eq('id', id)
          .eq('user_id', userId)
        if (updateError) throw updateError
      }

      return generatedTransactions.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['recurring_rules'] })
    },
  })
}

export function useWallets() {
  return useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return localGetWallets()
      return fetchWithCache<Wallet[]>('wallets', async () => {
        const { data, error } = await supabase.from('wallets').select('*').eq('user_id', userId).order('created_at')
        if (error) throw error
        return data as Wallet[]
      }, [])
    },
  })
}

export function useAddWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (wallet: Omit<Wallet, 'id' | 'created_at'>) => {
      const userId = await getCurrentUserId()
      if (!userId) return localAddWallet(wallet)
      const tempId = crypto.randomUUID()
      const tempItem: Wallet = { ...wallet, id: tempId, user_id: userId, created_at: new Date().toISOString() }
      if (isOffline()) {
        cacheAddItem('wallets', tempItem)
        enqueue({ table: 'wallets', op: 'insert', data: { ...wallet, user_id: userId, id: tempId }, userId })
        return tempItem
      }
      try {
        const { data, error } = await supabase.from('wallets').insert({ ...wallet, user_id: userId }).select().single()
        if (error) throw error
        return data as Wallet
      } catch (e) {
        if (isNetworkError(e)) {
          cacheAddItem('wallets', tempItem)
          enqueue({ table: 'wallets', op: 'insert', data: { ...wallet, user_id: userId, id: tempId }, userId })
          return tempItem
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallets'] }),
  })
}

export function useDeleteWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await getCurrentUserId()
      if (!userId) { localDeleteWallet(id); return }
      if (isOffline()) {
        cacheDeleteItem('wallets', id)
        enqueue({ table: 'wallets', op: 'delete', matchId: id, userId })
        return
      }
      try {
        const { error } = await supabase.from('wallets').delete().eq('id', id).eq('user_id', userId)
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) {
          cacheDeleteItem('wallets', id)
          enqueue({ table: 'wallets', op: 'delete', matchId: id, userId })
          return
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallets'] }),
  })
}

export function useRenameWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const userId = await getCurrentUserId()
      if (!userId) { localUpdateWallet(id, { name }); return }
      const patch = { name }
      if (isOffline()) {
        cacheUpdateItem('wallets', id, patch)
        enqueue({ table: 'wallets', op: 'update', data: patch as Record<string, unknown>, matchId: id, userId })
        return
      }
      try {
        const { error } = await supabase.from('wallets').update(patch).eq('id', id).eq('user_id', userId)
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) {
          cacheUpdateItem('wallets', id, patch)
          enqueue({ table: 'wallets', op: 'update', data: patch as Record<string, unknown>, matchId: id, userId })
          return
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallets'] }),
  })
}

export function useUpdateWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Omit<Wallet, 'created_at'>> & { id: string }) => {
      const userId = await getCurrentUserId()
      if (!userId) { localUpdateWallet(id, patch); return }
      if (isOffline()) {
        cacheUpdateItem('wallets', id, patch)
        enqueue({ table: 'wallets', op: 'update', data: patch as Record<string, unknown>, matchId: id, userId })
        return
      }
      try {
        const { error } = await supabase.from('wallets').update(patch).eq('id', id).eq('user_id', userId)
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) {
          cacheUpdateItem('wallets', id, patch)
          enqueue({ table: 'wallets', op: 'update', data: patch as Record<string, unknown>, matchId: id, userId })
          return
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallets'] }),
  })
}

export function useBudgetCategories() {
  return useQuery({
    queryKey: ['budget_categories'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return [...localGetCategories()].sort((a, b) => a.name.localeCompare(b.name))
      return fetchWithCache<BudgetCategory[]>('budget_categories', async () => {
        const { data, error } = await supabase.from('budget_categories').select('*').eq('user_id', userId).order('name')
        if (error) throw error
        return data as BudgetCategory[]
      }, [])
    },
  })
}

export function useAddBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cat: Omit<BudgetCategory, 'id' | 'created_at' | 'budget_period'> & Partial<Pick<BudgetCategory, 'budget_period'>>) => {
      const userId = await getCurrentUserId()
      if (!userId) return localAddCategory(cat)
      const payload = { budget_period: 'monthly' as const, ...cat }
      const tempId = crypto.randomUUID()
      const tempItem: BudgetCategory = { ...payload, id: tempId, user_id: userId, created_at: new Date().toISOString() }
      if (isOffline()) {
        cacheAddItem('budget_categories', tempItem)
        enqueue({ table: 'budget_categories', op: 'insert', data: { ...payload, user_id: userId, id: tempId }, userId })
        return tempItem
      }
      try {
        const { data, error } = await supabase.from('budget_categories').insert({ ...payload, user_id: userId }).select().single()
        if (error) throw error
        return data as BudgetCategory
      } catch (e) {
        if (isNetworkError(e)) {
          cacheAddItem('budget_categories', tempItem)
          enqueue({ table: 'budget_categories', op: 'insert', data: { ...payload, user_id: userId, id: tempId }, userId })
          return tempItem
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useDeleteBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await getCurrentUserId()
      if (!userId) { localDeleteCategory(id); return }
      if (isOffline()) {
        cacheDeleteItem('budget_categories', id)
        enqueue({ table: 'budget_categories', op: 'delete', matchId: id, userId })
        return
      }
      try {
        const { error } = await supabase.from('budget_categories').delete().eq('id', id).eq('user_id', userId)
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) {
          cacheDeleteItem('budget_categories', id)
          enqueue({ table: 'budget_categories', op: 'delete', matchId: id, userId })
          return
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useRenameBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: Pick<BudgetCategory, 'id' | 'name'>) => {
      const userId = await getCurrentUserId()
      if (!userId) { localUpdateCategory(id, { name }); return }
      const patch = { name }
      if (isOffline()) {
        cacheUpdateItem('budget_categories', id, patch)
        enqueue({ table: 'budget_categories', op: 'update', data: patch as Record<string, unknown>, matchId: id, userId })
        return
      }
      try {
        const { error } = await supabase.from('budget_categories').update(patch).eq('id', id).eq('user_id', userId)
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) {
          cacheUpdateItem('budget_categories', id, patch)
          enqueue({ table: 'budget_categories', op: 'update', data: patch as Record<string, unknown>, matchId: id, userId })
          return
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useUpdateBudgetCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, yearly_allocated, budget_period, color }: Pick<BudgetCategory, 'id' | 'yearly_allocated' | 'budget_period' | 'color'>) => {
      const userId = await getCurrentUserId()
      if (!userId) { localUpdateCategory(id, { yearly_allocated, budget_period, color }); return }
      const patch = { yearly_allocated, budget_period, color }
      if (isOffline()) {
        cacheUpdateItem('budget_categories', id, patch)
        enqueue({ table: 'budget_categories', op: 'update', data: patch as Record<string, unknown>, matchId: id, userId })
        return
      }
      try {
        const { error } = await supabase.from('budget_categories').update(patch).eq('id', id).eq('user_id', userId)
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) {
          cacheUpdateItem('budget_categories', id, patch)
          enqueue({ table: 'budget_categories', op: 'update', data: patch as Record<string, unknown>, matchId: id, userId })
          return
        }
        throw e
      }
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
      return fetchWithCache<BudgetRule[]>('budget_rules', async () => {
        const { data, error } = await supabase.from('budget_rules').select('*').eq('user_id', userId)
        if (error) throw error
        return data as BudgetRule[]
      }, [])
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

export function useInvestmentConfig() {
  return useQuery({
    queryKey: ['investment_config'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return localGetInvestment()
      return fetchWithCache<InvestmentConfig | null>('investment_config', async () => {
        const { data, error } = await supabase.from('investment_config').select('*').eq('user_id', userId).limit(1).maybeSingle()
        if (error) throw error
        return data as InvestmentConfig | null
      }, null)
    },
  })
}

export function useSaveInvestmentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (config: Partial<Omit<InvestmentConfig, 'created_at'>>) => {
      const userId = await getCurrentUserId()
      if (!userId) return localSaveInvestment(config)
      const { id, ...payload } = config
      if (isOffline()) {
        const cached = cacheGet<InvestmentConfig>('investment_config')
        const merged = { ...cached, ...payload, id: id ?? cached?.id ?? crypto.randomUUID(), user_id: userId, created_at: cached?.created_at ?? new Date().toISOString() } as InvestmentConfig
        cacheSet('investment_config', merged)
        const op = id ? 'update' : 'upsert'
        enqueue({ table: 'investment_config', op, data: { ...payload, user_id: userId, id: merged.id }, matchId: id, upsertConflict: 'user_id', userId })
        return merged
      }
      try {
        const { data, error } = id
          ? await supabase.from('investment_config').update(payload).eq('id', id).eq('user_id', userId).select().single()
          : await supabase.from('investment_config').insert({ ...payload, user_id: userId }).select().single()
        if (error) throw error
        cacheSet('investment_config', data)
        return data as InvestmentConfig
      } catch (e) {
        if (isNetworkError(e)) {
          const cached = cacheGet<InvestmentConfig>('investment_config')
          const merged = { ...cached, ...payload, id: id ?? cached?.id ?? crypto.randomUUID(), user_id: userId, created_at: cached?.created_at ?? new Date().toISOString() } as InvestmentConfig
          cacheSet('investment_config', merged)
          enqueue({ table: 'investment_config', op: id ? 'update' : 'upsert', data: { ...payload, user_id: userId, id: merged.id }, matchId: id, upsertConflict: 'user_id', userId })
          return merged
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['investment_config'] }),
  })
}

export function useEstimationPlans() {
  return useQuery({
    queryKey: ['estimation_plans'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return [...localGetPlans()].sort((a, b) => b.year - a.year || b.month - a.month)
      return fetchWithCache<EstimationPlan[]>('estimation_plans', async () => {
        const { data, error } = await supabase
          .from('estimation_plans').select('*').eq('user_id', userId)
          .order('year', { ascending: false }).order('month', { ascending: false })
        if (error) throw error
        return data as EstimationPlan[]
      }, [])
    },
  })
}

export function useUpsertEstimationPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (plan: Omit<EstimationPlan, 'id' | 'created_at'>) => {
      const userId = await getCurrentUserId()
      if (!userId) return localUpsertPlan(plan)
      if (isOffline()) {
        const existing = (cacheGet<EstimationPlan[]>('estimation_plans') ?? [])
          .find(p => p.month === plan.month && p.year === plan.year)
        const item: EstimationPlan = { ...plan, id: existing?.id ?? crypto.randomUUID(), user_id: userId, created_at: existing?.created_at ?? new Date().toISOString() }
        const list = (cacheGet<EstimationPlan[]>('estimation_plans') ?? []).filter(p => p.id !== item.id)
        cacheSet('estimation_plans', [item, ...list])
        enqueue({ table: 'estimation_plans', op: 'upsert', data: { ...plan, user_id: userId, id: item.id }, upsertConflict: 'user_id,month,year', userId })
        return item
      }
      try {
        const { data, error } = await supabase.from('estimation_plans')
          .upsert({ ...plan, user_id: userId }, { onConflict: 'user_id,month,year' }).select().single()
        if (error) throw error
        return data as EstimationPlan
      } catch (e) {
        if (isNetworkError(e)) {
          const existing = (cacheGet<EstimationPlan[]>('estimation_plans') ?? [])
            .find(p => p.month === plan.month && p.year === plan.year)
          const item: EstimationPlan = { ...plan, id: existing?.id ?? crypto.randomUUID(), user_id: userId, created_at: existing?.created_at ?? new Date().toISOString() }
          const list = (cacheGet<EstimationPlan[]>('estimation_plans') ?? []).filter(p => p.id !== item.id)
          cacheSet('estimation_plans', [item, ...list])
          enqueue({ table: 'estimation_plans', op: 'upsert', data: { ...plan, user_id: userId, id: item.id }, upsertConflict: 'user_id,month,year', userId })
          return item
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['estimation_plans'] }),
  })
}

export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return [...localGetGoals()].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
      return fetchWithCache<Goal[]>('goals', async () => {
        const { data, error } = await supabase.from('goals').select('*').eq('user_id', userId).order('created_at', { ascending: true })
        if (error) throw error
        return (data ?? []) as Goal[]
      }, [])
    },
  })
}

export function useAddGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (goalData: Omit<Goal, 'id' | 'user_id' | 'created_at'>) => {
      const userId = await getCurrentUserId()
      if (!userId) return localAddGoal(goalData)
      const tempId = crypto.randomUUID()
      const tempItem: Goal = { ...goalData, id: tempId, user_id: userId, created_at: new Date().toISOString() }
      if (isOffline()) {
        cacheAddItem('goals', tempItem)
        enqueue({ table: 'goals', op: 'insert', data: { ...goalData, user_id: userId, id: tempId }, userId })
        return tempItem
      }
      try {
        const { data: created, error } = await supabase.from('goals').insert({ ...goalData, user_id: userId }).select().single()
        if (error) throw error
        return created as Goal
      } catch (e) {
        if (isNetworkError(e)) {
          cacheAddItem('goals', tempItem)
          enqueue({ table: 'goals', op: 'insert', data: { ...goalData, user_id: userId, id: tempId }, userId })
          return tempItem
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })
}

export function useUpdateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Omit<Goal, 'created_at'>> & { id: string }) => {
      const userId = await getCurrentUserId()
      if (!userId) return localUpdateGoal(id, patch)
      if (isOffline()) {
        cacheUpdateItem('goals', id, patch)
        enqueue({ table: 'goals', op: 'update', data: patch as Record<string, unknown>, matchId: id, userId })
        return { id, ...patch } as Goal
      }
      try {
        const { data, error } = await supabase.from('goals').update(patch).eq('id', id).eq('user_id', userId).select().single()
        if (error) throw error
        return data as Goal
      } catch (e) {
        if (isNetworkError(e)) {
          cacheUpdateItem('goals', id, patch)
          enqueue({ table: 'goals', op: 'update', data: patch as Record<string, unknown>, matchId: id, userId })
          return { id, ...patch } as Goal
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const userId = await getCurrentUserId()
      if (!userId) { localDeleteGoal(id); return }
      if (isOffline()) {
        cacheDeleteItem('goals', id)
        enqueue({ table: 'goals', op: 'delete', matchId: id, userId })
        return
      }
      try {
        const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', userId)
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) {
          cacheDeleteItem('goals', id)
          enqueue({ table: 'goals', op: 'delete', matchId: id, userId })
          return
        }
        throw e
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })
}

export function useAppSettings() {
  return useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const userId = await getCurrentUserId()
      if (!userId) return localGetSettings()
      return fetchWithCache<AppSettings | null>('app_settings', async () => {
        const { data, error } = await supabase
          .from('app_settings').select('*').eq('user_id', userId)
          .order('created_at', { ascending: true }).limit(1).maybeSingle()
        if (error) throw error
        return data as AppSettings | null
      }, null)
    },
  })
}

export function useUpdateAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<Omit<AppSettings, 'created_at'>> & { id: string }) => {
      const userId = await getCurrentUserId()
      if (!userId) { localSaveSettings(rest); return }
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
      const userId = await getCurrentUserId()
      if (!userId) return localSaveSettings(settings)
      const { id, ...payload } = settings
      if (isOffline()) {
        const cached = cacheGet<AppSettings>('app_settings')
        const merged = { ...cached, ...payload, id: id ?? cached?.id ?? crypto.randomUUID(), user_id: userId, created_at: cached?.created_at ?? new Date().toISOString() } as AppSettings
        cacheSet('app_settings', merged)
        enqueue({ table: 'app_settings', op: 'upsert', data: { ...payload, user_id: userId, id: merged.id }, upsertConflict: 'user_id', userId })
        return merged
      }
      try {
        let targetId = id
        if (!targetId) {
          const { data: existing } = await supabase.from('app_settings').select('id').eq('user_id', userId).order('created_at').limit(1).maybeSingle()
          targetId = existing?.id
        }
        const query = targetId
          ? supabase.from('app_settings').update(payload).eq('id', targetId).eq('user_id', userId)
          : supabase.from('app_settings').insert({ ...payload, user_id: userId })
        const { data, error } = await query.select('*').single()
        if (error) throw error
        cacheSet('app_settings', data)
        return data as AppSettings
      } catch (e) {
        if (isNetworkError(e)) {
          const cached = cacheGet<AppSettings>('app_settings')
          const merged = { ...cached, ...payload, id: id ?? cached?.id ?? crypto.randomUUID(), user_id: userId, created_at: cached?.created_at ?? new Date().toISOString() } as AppSettings
          cacheSet('app_settings', merged)
          enqueue({ table: 'app_settings', op: 'upsert', data: { ...payload, user_id: userId, id: merged.id }, upsertConflict: 'user_id', userId })
          return merged
        }
        throw e
      }
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
      if (data.user?.id && hasGuestData()) await migrateGuestDataToAccount(data.user.id)
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
        clearSignedOutFlag()
        if (hasGuestData()) await migrateGuestDataToAccount(data.user.id)
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
      qc.setQueryData(['recurring_rules'], [])
      qc.setQueryData(['wallets'], [])
      qc.setQueryData(['budget_categories'], [])
      qc.setQueryData(['budget_rules'], [])
      qc.setQueryData(['investment_config'], null)
      qc.setQueryData(['estimation_plans'], [])
      qc.setQueryData(['app_settings'], null)
      qc.setQueryData(['goals'], [])
      invalidateAccountQueries(qc)
    },
  })
}
