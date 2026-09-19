import { Sheet, SheetContent } from '@/components/ui/sheet'
import { TransactionForm, type EntryType } from '@/components/transactions/TransactionForm'
import { useIsDesktop } from '@/hooks/useIsDesktop'

export function QuickAddSheet({ open, onClose, initialType, initialCash }: { open: boolean; onClose: () => void; initialType?: EntryType; initialCash?: boolean }) {
  const isDesktop = useIsDesktop()

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className={isDesktop ? 'lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-auto lg:max-h-[min(44rem,calc(100dvh-3rem))] lg:w-[min(44rem,calc(100vw-3rem))] lg:max-w-2xl lg:-translate-x-1/2 lg:-translate-y-1/2 lg:overflow-y-auto lg:rounded-[1.6rem] lg:border lg:border-border lg:bg-background lg:px-7 lg:pb-6 lg:pt-5 lg:shadow-2xl sm:max-w-2xl' : 'max-h-[92vh] overflow-y-auto rounded-t-3xl border-border bg-background px-5 pb-safe-10'}
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
