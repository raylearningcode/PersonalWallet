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
  const remaining = 100 - total

  const update = (index: number, field: keyof AllocationItem, val: string | number) => {
    onChange(value.map((item, i) => i === index ? { ...item, [field]: val } : item))
  }

  const remove = (index: number) => {
    if (value.length <= 1) return
    onChange(value.filter((_, i) => i !== index))
  }

  const add = () => {
    const fillPct = Math.max(0, Math.min(remaining, 10))
    onChange([...value, { name: '', pct: fillPct, color: '#6c63ff' }])
  }

  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <AllocationDonut items={value} />
      <div className="flex flex-1 flex-col gap-3">
        {/* Total indicator */}
        <div className="flex items-center justify-between">
          <span className={`text-xs font-extrabold ${isValid ? 'text-primary' : total > 100 ? 'text-[#FF8388]' : 'text-[#FFCF73]'}`}>
            {isValid
              ? '✓ 100% allocated'
              : total < 100
                ? `${remaining}% remaining to allocate`
                : `${total - 100}% over — reduce allocations`}
          </span>
          <span className="text-xs text-muted-foreground">{total}% total</span>
        </div>

        {/* Slider rows */}
        <div className="space-y-3">
          {value.map((item, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Asset color"
                  className="h-6 w-6 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                  value={item.color}
                  onChange={e => update(i, 'color', e.target.value)}
                />
                <Input
                  aria-label="Asset name"
                  className="h-7 flex-1 rounded-lg bg-secondary px-2 text-xs font-bold"
                  placeholder="Asset name"
                  value={item.name}
                  onChange={e => update(i, 'name', e.target.value)}
                />
                <span className="w-9 text-right text-xs font-extrabold text-foreground">{item.pct}%</span>
                <button
                  onClick={() => remove(i)}
                  disabled={value.length <= 1}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-muted-foreground hover:bg-secondary hover:text-[#FF8388] disabled:opacity-30"
                  aria-label={`Remove ${item.name || 'asset'}`}
                >
                  ×
                </button>
              </div>
              <input
                type="range"
                aria-label={`${item.name || 'Asset'} allocation percent`}
                min={0}
                max={100}
                step={1}
                value={item.pct}
                onChange={e => update(i, 'pct', Number(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-current"
                style={{ accentColor: item.color }}
              />
            </div>
          ))}
        </div>

        <button
          onClick={add}
          className="text-left text-xs font-bold text-primary hover:underline"
        >
          + Add asset
        </button>

        <Button
          size="sm"
          className="h-10 w-full"
          onClick={onSave}
          disabled={!isValid || isSaving}
        >
          {isSaving ? 'Saving…' : 'Save allocation'}
        </Button>
      </div>
    </div>
  )
}
