import { useRef } from 'react'
import { Check, Delete } from 'lucide-react'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'

interface MoneyKeypadProps {
  value: string
  onChange: (value: string) => void
  currency: string
  allowDecimal?: boolean
  quickAmounts?: number[]
  onQuickAmount?: (amount: number) => void
  onDone?: () => void
  variant?: 'compact' | 'panel'
  doneLabel?: string
}

const COMPACT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'] as const

function appendKey(value: string, key: string, allowDecimal: boolean) {
  const raw = value.replace(/[^\d.]/g, '')
  if (key === '.' && (!allowDecimal || raw.includes('.'))) return value
  if (key === '00' && !raw) return ''
  return formatNumberInput(`${raw}${key}`)
}

export function MoneyKeypad({
  value,
  onChange,
  currency,
  allowDecimal = true,
  quickAmounts = [],
  onQuickAmount,
  onDone,
  variant = 'compact',
  doneLabel = 'Done',
}: MoneyKeypadProps) {
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearedByHoldRef = useRef(false)
  const isPanel = variant === 'panel'
  const panelKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', allowDecimal ? '.' : '00', '0'] as const

  const setQuickAmount = (amount: number) => {
    onChange(formatNumberInput(amount))
    onQuickAmount?.(amount)
  }

  const backspace = () => {
    const raw = value.replace(/[^\d.]/g, '')
    onChange(formatNumberInput(raw.slice(0, -1)))
  }

  const clear = () => onChange('')

  const startBackspaceHold = () => {
    clearedByHoldRef.current = false
    clearTimerRef.current = setTimeout(() => {
      clearedByHoldRef.current = true
      clear()
    }, 450)
  }

  const stopBackspaceHold = () => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    clearTimerRef.current = null
  }

  const handleBackspaceClick = () => {
    if (clearedByHoldRef.current) {
      clearedByHoldRef.current = false
      return
    }
    backspace()
  }

  if (isPanel) {
    return (
      <div
        className="rounded-t-[2rem] border border-border bg-[#171717] px-4 pb-5 pt-3 shadow-2xl"
        data-testid="money-keypad"
      >
        <div className="mx-auto mb-5 h-1.5 w-16 rounded-full bg-white/10" />
        <div className="grid grid-cols-3 gap-3">
          {panelKeys.map(key => (
            <button
              key={key}
              type="button"
              className="flex min-h-[72px] items-center justify-center rounded-[1.6rem] bg-[#3B3B3B] text-3xl font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform active:scale-95"
              onClick={() => onChange(appendKey(value, key, allowDecimal))}
            >
              {key}
            </button>
          ))}
          <button
            type="button"
            aria-label="Backspace amount"
            className="flex min-h-[72px] items-center justify-center rounded-[1.6rem] bg-[#3B3B3B] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform active:scale-95"
            onClick={handleBackspaceClick}
            onDoubleClick={clear}
            onPointerDown={startBackspaceHold}
            onPointerUp={stopBackspaceHold}
            onPointerCancel={stopBackspaceHold}
            onPointerLeave={stopBackspaceHold}
          >
            <Delete className="h-7 w-7" />
          </button>
        </div>
        {quickAmounts.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            {quickAmounts.map(amount => (
              <button
                key={amount}
                type="button"
                className={`min-h-14 rounded-2xl px-3 text-base font-extrabold transition-transform active:scale-95 ${
                  parseNumberInput(value) === amount
                    ? 'bg-primary/25 text-primary ring-2 ring-primary/70'
                    : 'bg-[#05070D] text-white'
                }`}
                onClick={() => setQuickAmount(amount)}
              >
                {currency === 'TWD' ? `NT$${amount.toLocaleString()}` : `${currency} ${amount.toLocaleString()}`}
              </button>
            ))}
          </div>
        )}
        {onDone && (
          <button
            type="button"
            aria-label="Confirm amount"
            className="mx-auto mt-4 flex h-20 w-32 items-center justify-center rounded-[1.5rem] bg-white text-black transition-transform active:scale-95"
            onClick={onDone}
          >
            <Check className="h-10 w-10" aria-hidden="true" />
            <span className="sr-only">{doneLabel}</span>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-[1.25rem] border border-border bg-secondary/45 p-3" data-testid="money-keypad">
      <div className="grid grid-cols-3 gap-2">
        {COMPACT_KEYS.map(key => (
          <button
            key={key}
            type="button"
            className="flex h-12 items-center justify-center rounded-2xl border border-border bg-background text-lg font-extrabold text-foreground transition-colors active:scale-[0.98] hover:border-primary/50"
            onClick={() => onChange(appendKey(value, key, allowDecimal))}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          aria-label="Backspace amount"
          className="flex h-12 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground transition-colors active:scale-[0.98] hover:border-primary/50 hover:text-foreground"
          onClick={backspace}
          onDoubleClick={clear}
        >
          <Delete className="h-5 w-5" />
        </button>
        {allowDecimal && (
          <button
            type="button"
            className="col-span-3 flex h-11 items-center justify-center rounded-2xl border border-border bg-background text-lg font-extrabold text-foreground transition-colors active:scale-[0.98] hover:border-primary/50"
            onClick={() => onChange(appendKey(value, '.', allowDecimal))}
          >
            .
          </button>
        )}
      </div>
      {quickAmounts.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quickAmounts.map(amount => (
            <button
              key={amount}
              type="button"
              className={`min-h-11 rounded-2xl border px-3 text-sm font-extrabold transition-colors active:scale-[0.98] ${
                parseNumberInput(value) === amount
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-background text-foreground hover:border-primary/50'
              }`}
              onClick={() => setQuickAmount(amount)}
            >
              {currency === 'TWD' ? `NT$${amount.toLocaleString()}` : `${currency} ${amount.toLocaleString()}`}
            </button>
          ))}
        </div>
      )}
      {onDone && (
        <button
          type="button"
          aria-label="Done entering amount"
          className="mt-3 h-11 w-full rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground"
          onClick={onDone}
        >
          {doneLabel}
        </button>
      )}
    </div>
  )
}
