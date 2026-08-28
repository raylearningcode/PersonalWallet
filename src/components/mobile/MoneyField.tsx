import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { MoneyKeypad } from '@/components/mobile/MoneyKeypad'
import { useIsDesktop } from '@/hooks/useIsDesktop'

// Module-scoped registry: at most one MoneyField keypad may be open at a time
// (spec §5). Holds the stable close handle of the currently-open instance, or
// null when no keypad is open.
let keypadOwner: (() => void) | null = null

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
  // Stable per-instance close handle: its identity must survive re-renders
  // (the value prop changes on every keypad digit) so the module-level
  // ownership comparisons hold. It delegates to the latest setOpen via ref.
  const setOpenRef = useRef<(open: boolean) => void>(() => {})
  const myCloseFn = useRef<() => void>(() => setOpenRef.current(false))

  const setOpen = (open: boolean) => {
    if (open) {
      // Another field's keypad is open: close it first (exactly one active keypad).
      if (keypadOwner && keypadOwner !== myCloseFn.current) keypadOwner()
      keypadOwner = myCloseFn.current
    } else if (keypadOwner === myCloseFn.current) {
      keypadOwner = null
    }
    setKeypadOpen(open)
    window.dispatchEvent(new CustomEvent('finpath-keypad-change', { detail: { active: open } }))
  }
  setOpenRef.current = setOpen

  // Close keypad when AppLayout back handler fires; release ownership on unmount
  useEffect(() => {
    const close = () => setOpen(false)
    window.addEventListener('finpath-close-keypad', close)
    return () => {
      window.removeEventListener('finpath-close-keypad', close)
      if (keypadOwner === myCloseFn.current) keypadOwner = null
    }
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
