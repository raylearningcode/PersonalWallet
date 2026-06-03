import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DesktopTools } from './DesktopTools'

vi.mock('@/lib/queries', () => ({
  useAppSettings: () => ({ data: undefined }),
}))

describe('DesktopTools', () => {
  it('lists desktop-owned workflows with links', () => {
    render(
      <MemoryRouter>
        <DesktopTools />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Desktop tools' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Full Planning/ })).toHaveAttribute('href', '/planning')
    expect(screen.getByRole('link', { name: /AI setup/ })).toHaveAttribute('href', '/settings?section=ai')
    expect(screen.getByRole('link', { name: /Raw backup\/import/ })).toHaveAttribute('href', '/settings?section=backup')
  })
})
