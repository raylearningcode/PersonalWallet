import { describe, expect, it } from 'vitest'
import { supabaseAnonKey, supabaseUrl } from './supabase'

describe('supabase config', () => {
  it('has deploy-safe defaults so the app does not crash before render', () => {
    expect(supabaseUrl).toMatch(/^https:\/\/.+\.supabase\.co$/)
    expect(supabaseAnonKey.length).toBeGreaterThan(20)
  })
})
