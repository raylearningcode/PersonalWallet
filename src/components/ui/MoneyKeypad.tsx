import { useRef } from 'react'
import { Delete } from 'lucide-react'
import { formatNumberInput } from '@/lib/numberInput'
import { hapticLight, hapticMedium } from '@/lib/haptics'

interface MoneyKeypadProps {
  value: string
  onChange: (value: string) => void
  quickAmounts?: number[]
  currencyPrefix?: string
  label?: string
  onDone?: () => void
}

export function MoneyKeypad({ value, onChange, quickAmounts, currencyPrefix, label, onDone }: MoneyKeypadProps) {
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const press = (digit: string) => {
    hapticLight()
    const base = value === '0' ? '' : value
    onChange(formatNumberInput(base + digit))
  }

  const backspace = () => {
    hapticMedium()
    if (value.length <= 1) { onChange(''); return }
    onChange(formatNumberInput(value.slice(0, -1)))
  }

  const startLongPress = () => {
    clearTimer.current = setTimeout(() => { onChange('') }, 600)
  }

  const endLongPress = () => {
    if (clearTimer.current) clearTimeout(clearTimer.current)
  }

  const keys: Array<{ label: string; action: () => void; wide?: boolean }> = [
    { label: '1', action: () => press('1') },
    { label: '2', action: () => press('2') },
    { label: '3', action: () => press('3') },
    { label: '4', action: () => press('4') },
    { label: '5', action: () => press('5') },
    { label: '6', action: () => press('6') },
    { label: '7', action: () => press('7') },
    { label: '8', action: () => press('8') },
    { label: '9', action: () => press('9') },
    { label: '00', action: () => press('00') },
    { label: '0', action: () => press('0') },
    { label: '⌫', action: backspace },
  ]

  return (
    <div className="select-none">
      {label && (
        <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      )}
      {quickAmounts && quickAmounts.length > 0 && (
        <div className="mb-3 flex flex-wrap justify-center gap-2">
          {quickAmounts.map(amt => (
            <button
              key={amt}
              type="button"
              onClick={() => onChange(String(amt))}
              className="h-9 rounded-xl border border-border bg-secondary px-3 text-sm font-bold text-foreground transition-transform active:scale-95"
            >
              {currencyPrefix}{amt.toLocaleString()}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {keys.map(({ label: k, action }) => (
          <button
            key={k}
            type="button"
            onClick={action}
            onMouseDown={k === '⌫' ? startLongPress : undefined}
            onMouseUp={k === '⌫' ? endLongPress : undefined}
            onTouchStart={k === '⌫' ? startLongPress : undefined}
            onTouchEnd={k === '⌫' ? endLongPress : undefined}
            className="flex h-14 items-center justify-center rounded-2xl border border-border bg-secondary text-lg font-bold text-foreground transition-colors active:scale-95 active:bg-muted"
          >
            {k === '⌫' ? <Delete size={18} className="text-muted-foreground" /> : k}
          </button>
        ))}
      </div>
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="mt-3 h-12 w-full rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground transition-colors active:opacity-90"
        >
          Done
        </button>
      )}
    </div>
  )
}
