import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { BottomNav } from './BottomNav'

describe('BottomNav', () => {
  it('uses friendly mobile labels', () => {
    render(
      <MemoryRouter>
        <BottomNav onMoreClick={vi.fn()} moreActive={false} onAddClick={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: /Activity/ })).toBeInTheDocument()
    expect(screen.queryByText('Txns')).not.toBeInTheDocument()
  })
})
