import * as React from 'react'

export const KEYBOARD_SHORTCUTS = {
  'Add Expense': { key: 'n', ctrl: true, description: 'Add new expense' },
  'Add Income': { key: 'i', ctrl: true, description: 'Add new income' },
  'Transfer': { key: 't', ctrl: true, description: 'Transfer between wallets' },
  'Dashboard': { key: 'd', ctrl: true, description: 'Go to Dashboard' },
  'Transactions': { key: 'e', ctrl: true, description: 'Go to Transactions' },
  'Budget': { key: 'b', ctrl: true, description: 'Go to Budget' },
  'Goals': { key: 'g', ctrl: true, description: 'Go to Goals' },
  'Recurring': { key: 'r', ctrl: true, description: 'Go to Recurring' },
  'Reports': { key: 'p', ctrl: true, description: 'Go to Reports' },
  'Settings': { key: ',', ctrl: true, description: 'Go to Settings' },
  'Help': { key: '?', description: 'Show keyboard shortcuts' },
  'Escape': { key: 'Escape', description: 'Close dialog/sheet' },
} as const

export type ShortcutAction = keyof typeof KEYBOARD_SHORTCUTS

export function useKeyboardShortcuts(handlers: Partial<Record<ShortcutAction, () => void>>) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return
      }

      // Check each shortcut
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault()
        handlers['Add Expense']?.()
      } else if (e.ctrlKey && e.key === 'i') {
        e.preventDefault()
        handlers['Add Income']?.()
      } else if (e.ctrlKey && e.key === 't') {
        e.preventDefault()
        handlers['Transfer']?.()
      } else if (e.ctrlKey && e.key === 'd') {
        e.preventDefault()
        handlers['Dashboard']?.()
      } else if (e.ctrlKey && e.key === 'e') {
        e.preventDefault()
        handlers['Transactions']?.()
      } else if (e.ctrlKey && e.key === 'b') {
        e.preventDefault()
        handlers['Budget']?.()
      } else if (e.ctrlKey && e.key === 'g') {
        e.preventDefault()
        handlers['Goals']?.()
      } else if (e.ctrlKey && e.key === 'r') {
        e.preventDefault()
        handlers['Recurring']?.()
      } else if (e.ctrlKey && e.key === 'p') {
        e.preventDefault()
        handlers['Reports']?.()
      } else if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        handlers['Settings']?.()
      } else if (e.key === '?') {
        e.preventDefault()
        handlers['Help']?.()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handlers['Escape']?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlers])
}
