import { beforeEach, describe, expect, it, vi } from 'vitest'
import { localAddCategory, localGetCategories, localUpdateCategory } from './localStore'

describe('localStore budget categories', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
  })

  it('keeps icon and rollover settings for guest/offline categories', () => {
    const category = localAddCategory({
      name: 'Dining',
      icon: '🍔',
      yearly_allocated: 500000,
      budget_period: 'monthly',
      reset_frequency: 'monthly',
      reset_start_day: 15,
      rollover_enabled: true,
      rollover_mode: 'custom_cap',
      rollover_cap: 200000,
      color: '#6c63ff',
    })

    expect(category).toMatchObject({
      icon: '🍔',
      reset_frequency: 'monthly',
      reset_start_day: 15,
      rollover_enabled: true,
      rollover_mode: 'custom_cap',
      rollover_cap: 200000,
    })
    expect(localGetCategories()[0]).toMatchObject(category)

    localUpdateCategory('00000000-0000-4000-8000-000000000001', { rollover_enabled: false, rollover_cap: null })
    expect(localGetCategories()[0]).toMatchObject({
      rollover_enabled: false,
      rollover_cap: null,
    })
  })
})
