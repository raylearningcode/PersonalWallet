import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { TransactionForm, type EntryType } from '@/components/transactions/TransactionForm'

/**
 * Mobile full-page add-transaction flow. Desktop users are redirected to the
 * history page, where the QuickAddSheet covers the same form.
 */
export function AddTransaction() {
  const navigate = useNavigate()
  const isDesktop = useIsDesktop()
  const [searchParams] = useSearchParams()

  const redirectedRef = useRef(false)
  useEffect(() => {
    if (isDesktop && !redirectedRef.current) {
      redirectedRef.current = true
      navigate('/transactions', { replace: true })
    }
  }, [isDesktop, navigate])

  const paramType = searchParams.get('type') as EntryType | null
  const paramCash = searchParams.get('cash') === 'true'

  if (isDesktop) return null

  return (
    <TransactionForm
      variant="page"
      initialType={paramType ?? 'expense'}
      initialCash={paramCash}
      onBack={() => navigate(-1)}
      onDone={() => {
        // Go back to where the user came from; fall back to history if opened directly.
        if (window.history.length > 1) navigate(-1)
        else navigate('/transactions', { replace: true })
      }}
    />
  )
}
