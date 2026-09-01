import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { KEYBOARD_SHORTCUTS } from '@/lib/keyboard'

export function KeyboardShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const shortcuts = Object.entries(KEYBOARD_SHORTCUTS).map(([action, config]) => {
    const { key, description } = config
    const ctrl = 'ctrl' in config && config.ctrl
    return {
      action,
      key,
      description,
      ctrl: ctrl || false,
    }
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span>Keyboard Shortcuts</span>
            <span className="text-xs font-normal text-muted-foreground">(Press ? anytime)</span>
          </SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-2">
          {shortcuts.map(({ action, key, ctrl, description }) => (
            <div key={action} className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3">
              <span className="text-sm text-foreground">{description}</span>
              <div className="flex items-center gap-1">
                {ctrl && (
                  <>
                    <kbd className="rounded border border-border bg-background px-2 py-1 text-xs font-bold">Ctrl</kbd>
                    <span className="text-xs text-muted-foreground">+</span>
                  </>
                )}
                <kbd className="rounded border border-border bg-background px-2 py-1 text-xs font-bold uppercase">
                  {key === '?' ? '?' : key === 'Escape' ? 'Esc' : key.length > 1 ? key : key.toUpperCase()}
                </kbd>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
          <p>Keyboard shortcuts are disabled when typing in text fields.</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
