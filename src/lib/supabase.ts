import { createClient } from '@supabase/supabase-js'

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Fail fast instead of silently running against a hardcoded fallback.
if (!envUrl || !envAnonKey) {
  throw new Error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment (e.g. .env.local — see .env.example).'
  )
}

export const supabaseUrl = envUrl
export const supabaseAnonKey = envAnonKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
