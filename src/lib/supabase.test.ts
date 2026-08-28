import { afterEach, describe, expect, it, vi } from 'vitest'

describe('supabase config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('throws a descriptive error when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', undefined)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', undefined)
    vi.resetModules()

    await expect(import('./supabase')).rejects.toThrow(/VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/)
  })

  it('creates the client when both env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test-project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
    vi.resetModules()

    const mod = await import('./supabase')
    expect(mod.supabaseUrl).toBe('https://test-project.supabase.co')
    expect(mod.supabaseAnonKey).toBe('test-anon-key')
    expect(mod.supabase).toBeDefined()
  })
})
