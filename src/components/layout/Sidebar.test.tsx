import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

vi.mock('@/lib/queries', () => ({
  useGoals: () => ({ data: [] }),
  useAuthSession: () => ({ data: null }),
  useAppSettings: () => ({ data: undefined }),
  useSignIn: () => ({ mutateAsync: async () => {}, isPending: false }),
  useSignUp: () => ({ mutateAsync: async () => {}, isPending: false }),
  useSignOut: () => ({ mutateAsync: async () => {}, isPending: false }),
}))

describe('Sidebar', () => {
  it('renders the FinPath concept shell with active navigation and the yearly goal card', () => {
    render(
      <MemoryRouter initialEntries={['/budget']}>
        <Sidebar profileOpen={false} onProfileOpenChange={() => {}} />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'FinPath' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /budget/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('2026 goal')).toBeInTheDocument()
    expect(screen.getByText('No goal set')).toBeInTheDocument()
    expect(screen.getByText('0% completed')).toBeInTheDocument()
  })
})
