import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AllocationItem } from '@/types'

const CIRCUMFERENCE = 2 * Math.PI * 28

function AllocationDonut({ items }: { items: AllocationItem[] }) {
  const valid = items.filter(item => item.pct > 0)
  const total = items.reduce((sum, item) => sum + item.pct, 0)
  let cumulativePct = 0

  return (
    <svg width="90" height="90" viewBox="0 0 72 72" className="shrink-0">
      <circle cx="36" cy="36" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
      {total > 0 && valid.map((item, i) => {
        const dash = (item.pct / 100) * CIRCUMFERENCE
        const offset = CIRCUMFERENCE * (0.25 - cumulativePct / 100)
        cumulativePct += item.pct
        return (
          <circle
            key={i}
            cx="36"
            cy="36"
            r="28"
            fill="none"
            stroke={item.color}
            strokeWidth="12"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            strokeDashoffset={offset}
          />
        )
      })}
      <text x="36" y="40" textAnchor="middle" fill="hsl(var(--foreground))" fontSize="9" fontWeight="800">
        {total}%
      </text>
    </svg>
  )
}

interface Props {
  value: AllocationItem[]
  onChange: (items: AllocationItem[]) => void
  onSave: () => void
  isSaving: boolean
}

export function AllocationEditor({ value, onChange, onSave, isSaving }: Props) {
  const total = value.reduce((sum, item) => sum + item.pct, 0)
  const isValid = total === 100

  const update = (index: number, field: keyof AllocationItem, val: string | number) => {
    onChange(value.map((item, i) => i === index ? { ...item, [field]: val } : item))
  }

  const remove = (index: number) => {
    if (value.length <= 1) return
    onChange(value.filter((_, i) => i !== index))
  }

  const add = () => {
    onChange([...value, { name: '', pct: 0, color: '#6c63ff' }])
  }

  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <AllocationDonut items={value} />
      <div className="flex flex-1 flex-col gap-2">
        <div className="max-h-[200px] space-y-1.5 overflow-y-auto pr-1">
          {value.map((item, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_28px_56px_18px] items-center gap-1.5">
              <Input
                aria-label="Asset name"
                className="h-7 rounded-lg bg-secondary px-2 text-xs font-bold"
                placeholder="Name"
                value={item.name}
                onChange={e => update(i, 'name', e.target.value)}
              />
              <input
                type="color"
                aria-label="Asset color"
                className="h-7 w-7 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                value={item.color}
                onChange={e => update(i, 'color', e.target.value)}
              />
              <Input
                type="number"
                aria-label="Allocation percent"
                className="h-7 rounded-lg bg-secondary px-2 text-right text-xs font-bold"
                min={0}
                max={100}
                value={item.pct}
                onChange={e => update(i, 'pct', Number(e.target.value))}
              />
              <button
                onClick={() => remove(i)}
                disabled={value.length <= 1}
                className="text-sm text-destructive disabled:opacity-30"
                aria-label="Remove asset"
              >
                x
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={add}
          className="text-left text-xs font-bold text-primary hover:underline"
        >
          + Add asset
        </button>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className={`text-xs font-bold ${isValid ? 'text-green-400' : 'text-amber-400'}`}>
            {isValid
              ? '100% OK'
              : total < 100
                ? `${total}% - needs ${100 - total}% more`
                : `${total}% - reduce by ${total - 100}%`}
          </span>
          <Button
            size="sm"
            className="h-7 px-4 text-xs"
            onClick={onSave}
            disabled={!isValid || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
