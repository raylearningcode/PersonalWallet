import { supabase, supabaseUrl, supabaseAnonKey } from './supabase'

// Every owned table — used only as a fallback wipe when auth deletion fails.
const TABLES = [
  'wallets', 'transactions', 'recurring_rules', 'budget_categories', 'budget_rules',
  'investment_config', 'estimation_plans', 'app_settings', 'goals', 'holdings',
  'dividend_logs', 'net_worth_snapshots',
]

/**
 * Permanently deletes the signed-in account and all of its data.
 *
 * Preferred path is deleting the auth user — every owned row cascades away
 * via the user_id foreign keys. If that endpoint fails (network, policy),
 * fall back to wiping rows table by table and signing out.
 */
export async function deleteAccountAndData(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) throw new Error('Not signed in')

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'DELETE',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    for (const table of TABLES) {
      try { await supabase.from(table).delete().eq('user_id', session.user.id) } catch { /* keep going */ }
    }
    await supabase.auth.signOut()
  }
}

/** Wipes every finpath_* localStorage key (device-local data, session flags). */
export function clearLocalFinPathKeys(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('finpath_')) keys.push(key)
  }
  for (const key of keys) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  }
}
