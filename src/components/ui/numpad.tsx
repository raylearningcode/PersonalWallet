import { Delete } from 'lucide-react'

interface NumpadProps {
  value: string
  onChange: (value: string) => void
}

export function Numpad({ value, onChange }: NumpadProps) {
  const press = (key: string) => {
    if (key === 'del') {
      onChange(value.slice(0, -1))
      return
    }
    if (key === '.') {
      if (value.includes('.')) return
      onChange((value || '0') + '.')
      return
    }
    if (value === '0') { onChange(key); return }
    const dotIdx = value.indexOf('.')
    if (dotIdx !== -1 && value.length - dotIdx > 2) return
    onChange(value + key)
  }

  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'del'] as const

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {keys.map(key => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          className="flex h-14 items-center justify-center rounded-2xl bg-secondary text-xl font-extrabold text-foreground transition-all hover:bg-muted active:scale-95"
        >
          {key === 'del' ? <Delete className="h-5 w-5 text-muted-foreground" /> : key}
        </button>
      ))}
    </div>
  )
}
