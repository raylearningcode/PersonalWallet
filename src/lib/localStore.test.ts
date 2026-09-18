import { beforeEach, describe, expect, it, vi } from 'vitest'
import { localAddCategory, localGetCategories, localUpdateCategory } from './localStore'

describe('localStore budget categories', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('cat-offline')
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

    localUpdateCategory('cat-offline', { rollover_enabled: false, rollover_cap: null })
    expect(localGetCategories()[0]).toMatchObject({
      rollover_enabled: false,
      rollover_cap: null,
    })
  })
})
