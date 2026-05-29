import { useState } from 'react'

export const PIN_STORAGE_KEY = 'finpath_pin'
export const PIN_SESSION_KEY = 'finpath_unlocked'

export function hashPin(pin: string) {
  return btoa(pin + ':finpath')
}

export function PinLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState(false)

  const press = (d: string) => {
    if (digits.length >= 4 || error) return
    const next = digits + d
    setDigits(next)
    if (next.length === 4) {
      const stored = localStorage.getItem(PIN_STORAGE_KEY)
      if (stored === hashPin(next)) {
        onUnlock()
      } else {
        setError(true)
        setTimeout(() => { setDigits(''); setError(false) }, 700)
      }
    }
  }

  const del = () => {
    if (!error) setDigits(prev => prev.slice(0, -1))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">FinPath</p>
      <h1 className="mb-8 text-2xl font-extrabold text-foreground">Enter your PIN</h1>
      <div className="mb-3 flex gap-4">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors duration-150 ${
              error
                ? 'border-[#FF8388] bg-[#FF8388]'
                : i < digits.length
                  ? 'border-primary bg-primary'
                  : 'border-muted-foreground bg-transparent'
            }`}
          />
        ))}
      </div>
      <div className="mb-6 h-5">
        {error && <p className="text-sm font-bold text-[#FF8388]">Incorrect PIN</p>}
      </div>
      <div className="grid w-full max-w-[280px] grid-cols-3 gap-3">
        {(['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const).map((key, i) =>
          key === '' ? <div key={i} /> : (
            <button
              key={key + i}
              type="button"
              onClick={() => key === '⌫' ? del() : press(key)}
              className="flex h-16 items-center justify-center rounded-2xl bg-secondary text-2xl font-extrabold text-foreground transition-all hover:bg-muted active:scale-95"
            >
              {key}
            </button>
          )
        )}
      </div>
    </div>
  )
}
