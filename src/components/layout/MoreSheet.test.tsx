import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MoreSheet } from './MoreSheet'

vi.mock('@/lib/queries', () => ({
  useGoals: () => ({ data: [] }),
}))

describe('MoreSheet', () => {
  it('uses pocket-focused labels and routes desktop tools separately', () => {
    render(
      <MemoryRouter>
        <MoreSheet open onClose={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /Goal contribution/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Recurring bills/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Wallets & cash/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Desktop tools/ })).toBeInTheDocument()
  })
})
