import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { formatNumberInput } from '@/lib/numberInput'
import type { ComponentPropsWithoutRef } from 'react'

interface MoneyInputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'onChange' | 'value'> {
  value: string
  onValueChange: (raw: string) => void
}

/**
 * Number input that shows a formatted value (e.g. "100,000") when not focused
 * and a raw value while the user is typing so the browser caret stays stable.
 * Accepts onValueChange(raw) where raw is digits-only (no commas).
 */
export function MoneyInput({ value, onValueChange, className, placeholder = '0', ...props }: MoneyInputProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const display = editing ? value : formatNumberInput(value)

  return (
    <Input
      {...props}
      ref={inputRef}
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      value={display}
      onChange={e => {
        const clean = e.target.value.replace(/[^\d.]/g, '')
        onValueChange(clean)
      }}
      onFocus={() => {
        setEditing(true)
        // Strip commas so the caret lands at the end of the raw number
        onValueChange(value.replace(/,/g, ''))
      }}
      onBlur={() => setEditing(false)}
    />
  )
}
