import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Auth } from './Auth'

const signIn = vi.fn()
const signUp = vi.fn()

vi.mock('@/lib/queries', () => ({
  useAuthSession: () => ({ data: null }),
  useSignIn: () => ({ mutateAsync: signIn, isPending: false }),
  useSignUp: () => ({ mutateAsync: signUp, isPending: false }),
  useSignOut: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('Auth', () => {
  it('uses a full-page mobile-safe sign-in flow', () => {
    render(
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Sync your data' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Auth email'), { target: { value: 'ray@example.com' } })
    fireEvent.change(screen.getByLabelText('Auth password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(signIn).toHaveBeenCalledWith({ email: 'ray@example.com', password: 'secret123' })
    expect(screen.getByRole('button', { name: 'Continue as guest' })).toBeInTheDocument()
  })

  it('can create an account from the same page', () => {
    render(
      <MemoryRouter initialEntries={['/auth']}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Auth email'), { target: { value: 'ray@example.com' } })
    fireEvent.change(screen.getByLabelText('Auth password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(signUp).toHaveBeenCalledWith({ email: 'ray@example.com', password: 'secret123' })
  })
})
