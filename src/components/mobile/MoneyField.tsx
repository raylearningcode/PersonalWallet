import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { MoneyKeypad } from '@/components/mobile/MoneyKeypad'
import { useIsDesktop } from '@/hooks/useIsDesktop'

export function MoneyField(props: {
  value: string
  onChange: (v: string) => void
  currency: string
  ariaLabel: string
  placeholder?: string
  className?: string
  keypadDoneLabel?: string
  keypadQuickAmounts?: number[]
}) {
  const { value, onChange, currency, ariaLabel, placeholder, className, keypadDoneLabel, keypadQuickAmounts } = props
  const isDesktop = useIsDesktop()
  const [keypadOpen, setKeypadOpen] = useState(false)
  const fieldRef = useRef<HTMLInputElement>(null)

  const setOpen = (open: boolean) => {
    setKeypadOpen(open)
    window.dispatchEvent(new CustomEvent('finpath-keypad-change', { detail: { active: open } }))
  }

  // Close keypad when AppLayout back handler fires
  useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener('finpath-close-keypad', close)
    return () => window.removeEventListener('finpath-close-keypad', close)
  }, [])

  // Close keypad on outside tap (same convention as QuickAddSheet's sheet-level handler)
  useEffect(() => {
    if (keypadOpen) {
      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target as HTMLElement
        if (target.closest('[data-money-keypad-panel], [data-keypad-trigger]')) return
        setOpen(false)
      }
      document.addEventListener('pointerdown', handlePointerDown)
      return () => document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [keypadOpen])

  return (
    <div>
      <Input
        ref={fieldRef}
        aria-label={ariaLabel}
        readOnly={!isDesktop}
        inputMode={isDesktop ? 'decimal' : undefined}
        className={className ?? 'bg-secondary'}
        placeholder={placeholder ?? '0'}
        value={value}
        onChange={e => onChange(e.target.value)}
        data-keypad-trigger="amount"
        onClick={() => { if (!isDesktop) setOpen(true) }}
        onFocus={() => { if (!isDesktop) setOpen(true) }}
      />
      {!isDesktop && keypadOpen && (
        <div
          className="-mx-5 sticky z-20"
          style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))' }}
          data-money-keypad-panel
        >
          <MoneyKeypad
            value={value}
            onChange={onChange}
            currency={currency}
            allowDecimal={currency !== 'IDR'}
            quickAmounts={keypadQuickAmounts ?? (currency === 'TWD' ? [50, 100, 500, 1000] : [])}
            onDone={() => setOpen(false)}
            variant="panel"
            doneLabel={keypadDoneLabel ?? 'Confirm amount'}
          />
        </div>
      )}
    </div>
  )
}
