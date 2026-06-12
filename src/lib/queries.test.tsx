import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppSettings, useSaveAppSettings } from './queries'

const mockSupabase = vi.hoisted(() => {
  const builders: any[] = []
  const maybeSingleResponses: any[] = []
  const singleResponses: any[] = []
  const getSession = vi.fn(() => Promise.resolve({
    data: { session: { user: { id: 'user-1', email: 'ray@example.com' } } },
    error: null,
  }))

  function makeBuilder() {
    const builder = {
      select: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve(maybeSingleResponses.shift())),
      insert: vi.fn(() => builder),
      update: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve(singleResponses.shift())),
    }
    builders.push(builder)
    return builder
  }

  return {
    builders,
    from: vi.fn(() => makeBuilder()),
    getSession,
    maybeSingleResponses,
    singleResponses,
    reset() {
      builders.length = 0
      maybeSingleResponses.length = 0
      singleResponses.length = 0
      this.from.mockClear()
      this.getSession.mockClear()
    },
  }
})

vi.mock('./supabase', () => ({
  supabase: {
    from: mockSupabase.from,
    auth: {
      getSession: mockSupabase.getSession,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('settings queries', () => {
  beforeEach(() => {
    mockSupabase.reset()
  })

  it('loads the oldest app settings row deterministically', async () => {
    const settings = {
      id: 'settings-1',
      user_name: '',
      email: '',
      theme: 'dark',
      base_currency: 'IDR',
      currency: 'USD',
      year_start: '',
      default_view: '',
      notifications: '',
      annual_goal_label: '',
      annual_goal_pct: 0,
    }
    mockSupabase.maybeSingleResponses.push({ data: settings, error: null })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useAppSettings(), { wrapper: createWrapper(queryClient) })

    await waitFor(() => expect(result.current.data).toEqual(settings))
    expect(mockSupabase.builders[0].eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(mockSupabase.builders[0].order).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('saves currency into an existing settings row when the UI has no loaded id yet', async () => {
    const savedSettings = {
      id: 'settings-1',
      user_name: '',
      email: '',
      theme: 'dark',
      base_currency: 'IDR',
      currency: 'TWD',
      year_start: '',
      default_view: '',
      notifications: '',
      annual_goal_label: '',
      annual_goal_pct: 0,
    }
    mockSupabase.maybeSingleResponses.push({ data: { id: 'settings-1' }, error: null })
    mockSupabase.singleResponses.push({ data: savedSettings, error: null })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useSaveAppSettings(), { wrapper: createWrapper(queryClient) })

    await act(async () => {
      await result.current.mutateAsync({
        user_name: '',
        email: '',
        theme: 'dark',
        base_currency: 'IDR',
        currency: 'TWD',
        year_start: '',
        default_view: '',
        notifications: '',
        annual_goal_label: '',
        annual_goal_pct: 0,
      })
    })

    expect(mockSupabase.builders[0].select).toHaveBeenCalledWith('id')
    expect(mockSupabase.builders[0].eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(mockSupabase.builders[1].update).toHaveBeenCalledWith(expect.objectContaining({
      base_currency: 'IDR',
      currency: 'TWD',
    }))
    expect(mockSupabase.builders[1].insert).not.toHaveBeenCalled()
    expect(queryClient.getQueryData(['app_settings'])).toEqual(savedSettings)
  })
})
