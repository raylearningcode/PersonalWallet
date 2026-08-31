import { Sheet, SheetContent } from '@/components/ui/sheet'
import { TransactionForm, type EntryType } from '@/components/transactions/TransactionForm'

export function QuickAddSheet({ open, onClose, initialType, initialCash }: { open: boolean; onClose: () => void; initialType?: EntryType; initialCash?: boolean }) {
  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-border bg-background px-5 pb-safe-10"
      >
        {/* Mounted only while open, so state resets between opens */}
        <TransactionForm
          variant="sheet"
          initialType={initialType}
          initialCash={initialCash}
          onDone={onClose}
          onNavigate={onClose}
        />
      </SheetContent>
    </Sheet>
  )
}
