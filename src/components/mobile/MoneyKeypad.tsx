import { Delete } from 'lucide-react'
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput'

interface MoneyKeypadProps {
  value: string
  onChange: (value: string) => void
  currency: string
  allowDecimal?: boolean
  quickAmounts?: number[]
  onQuickAmount?: (amount: number) => void
  onDone?: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'] as const

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
}: MoneyKeypadProps) {
  const setQuickAmount = (amount: number) => {
    onChange(formatNumberInput(amount))
    onQuickAmount?.(amount)
  }

  const backspace = () => {
    const raw = value.replace(/[^\d.]/g, '')
    onChange(formatNumberInput(raw.slice(0, -1)))
  }

  const clear = () => onChange('')

  return (
    <div className="rounded-[1.25rem] border border-border bg-secondary/45 p-3" data-testid="money-keypad">
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map(key => (
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
          className="mt-3 h-11 w-full rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground"
          onClick={onDone}
        >
          Done
        </button>
      )}
    </div>
  )
}
