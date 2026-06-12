import { createClient } from '@supabase/supabase-js'

export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://ctrigcpfccvokoxfzcil.supabase.co'

export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_fq7cieGFtdutY2caI9-HGA_i87HUutU'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
