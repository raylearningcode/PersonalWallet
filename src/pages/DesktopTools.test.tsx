import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { DesktopTools } from './DesktopTools'

vi.mock('@/lib/queries', () => ({
useTransactions: () => ({ data: [] }),
useBudgetCategories: () => ({ data: [] }),
useRecurringRules: () => ({ data: [] }),
useGoals: () => ({ data: [] }),
  useAppSettings: () => ({ data: undefined }),
}))

describe('DesktopTools', () => {
  it('lists desktop-owned workflows with links', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DesktopTools />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByRole('heading', { name: 'Desktop tools' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Full Planning/ })).toHaveAttribute('href', '/planning')
    expect(screen.getByRole('link', { name: /AI setup/ })).toHaveAttribute('href', '/settings?section=ai')
    expect(screen.getByRole('link', { name: /Raw backup\/import/ })).toHaveAttribute('href', '/settings?section=backup')
  })
})
