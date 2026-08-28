import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MoneyField } from './MoneyField'
import { useIsDesktop } from '@/hooks/useIsDesktop'

// jsdom: useIsDesktop matches min-width 1024 — desktop is the default true branch in tests
// unless the window is narrow; mock to force mobile:
vi.mock('@/hooks/useIsDesktop', () => ({ useIsDesktop: vi.fn(() => false) }))

describe('MoneyField (mobile)', () => {
  it('renders a readOnly input and opens the keypad on tap', () => {
    const onChange = vi.fn()
    render(<MoneyField value="12" onChange={onChange} currency="USD" ariaLabel="Amount" />)
    const input = screen.getByLabelText('Amount')
    expect(input).toHaveAttribute('readonly')
    fireEvent.click(input)
    // Keypad is rendered (MoneyKeypad is in the tree; assert by its confirm button label)
    expect(screen.getByRole('button', { name: /confirm amount/i })).toBeInTheDocument()
  })
  it('passes keypad edits to onChange', () => {
    const onChange = vi.fn()
    render(<MoneyField value="" onChange={onChange} currency="USD" ariaLabel="Amount" />)
    fireEvent.click(screen.getByLabelText('Amount'))
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    expect(onChange).toHaveBeenCalledWith('5')
  })
})

describe('MoneyField (desktop)', () => {
  it('is a plain editable input with no keypad', () => {
    vi.mocked(useIsDesktop).mockReturnValue(true)
    const onChange = vi.fn()
    render(<MoneyField value="12" onChange={onChange} currency="USD" ariaLabel="Amount" />)
    const input = screen.getByLabelText('Amount')
    expect(input).not.toHaveAttribute('readonly')
    fireEvent.click(input)
    expect(screen.queryByRole('button', { name: /confirm amount/i })).not.toBeInTheDocument()
    fireEvent.change(input, { target: { value: '34' } })
    expect(onChange).toHaveBeenCalledWith('34')
  })
})
