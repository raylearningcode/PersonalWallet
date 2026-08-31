import { supabase } from './supabase'
import type { QueryClient } from '@tanstack/react-query'

// One query-key prefix per public table; queries.ts keys use the table name
// as the first segment ('dividends' maps to dividend_logs).
const TABLE_TO_KEY: Record<string, string> = {
  wallets: 'wallets',
  transactions: 'transactions',
  recurring_rules: 'recurring_rules',
  budget_categories: 'budget_categories',
  investment_config: 'investment_config',
  estimation_plans: 'estimation_plans',
  app_settings: 'app_settings',
  goals: 'goals',
  holdings: 'holdings',
  dividend_logs: 'dividends',
}

const TABLES = Object.keys(TABLE_TO_KEY)

/**
 * Live cross-device sync: subscribes to postgres changes for every app table
 * and invalidates the matching queries so data refreshes the moment another
 * device (desktop <-> Android) writes. Only call while signed in — RLS scopes
 * each subscriber to their own rows. Returns a cleanup fn that removes the
 * channel.
 */
export function startRealtimeSync(qc: QueryClient): () => void {
  let channel = supabase.channel('finpath-realtime')
  for (const table of TABLES) {
    const key = TABLE_TO_KEY[table]
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => {
        qc.invalidateQueries({ predicate: q => q.queryKey[0] === key })
      },
    )
  }
  channel.subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
