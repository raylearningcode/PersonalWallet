import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MoneyKeypad } from './MoneyKeypad'

describe('MoneyKeypad', () => {
  it('formats tapped digits without opening a native input', () => {
    const onChange = vi.fn()
    render(<MoneyKeypad value="1,000" onChange={onChange} currency="TWD" />)

    fireEvent.click(screen.getByRole('button', { name: '0' }))

    expect(onChange).toHaveBeenCalledWith('10,000')
  })

  it('sets quick tender amounts', () => {
    const onChange = vi.fn()
    render(<MoneyKeypad value="" onChange={onChange} currency="TWD" quickAmounts={[100, 500]} />)

    fireEvent.click(screen.getByRole('button', { name: 'NT$500' }))

    expect(onChange).toHaveBeenCalledWith('500')
  })
})
