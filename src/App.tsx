import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'

const Transactions = lazy(() => import('@/pages/Transactions').then(m => ({ default: m.Transactions })))
const Budget = lazy(() => import('@/pages/Budget').then(m => ({ default: m.Budget })))
const Estimation = lazy(() => import('@/pages/Estimation').then(m => ({ default: m.Estimation })))
const Investing = lazy(() => import('@/pages/Investing').then(m => ({ default: m.Investing })))
const Reports = lazy(() => import('@/pages/Reports').then(m => ({ default: m.Reports })))
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })))
const Goals = lazy(() => import('@/pages/Goals').then(m => ({ default: m.Goals })))
const Subscriptions = lazy(() => import('@/pages/Subscriptions').then(m => ({ default: m.Subscriptions })))

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="transactions" element={<Suspense fallback={<PageLoader />}><Transactions /></Suspense>} />
        <Route path="budget" element={<Suspense fallback={<PageLoader />}><Budget /></Suspense>} />
        <Route path="estimation" element={<Suspense fallback={<PageLoader />}><Estimation /></Suspense>} />
        <Route path="planning" element={<Suspense fallback={<PageLoader />}><Estimation /></Suspense>} />
        <Route path="investing" element={<Suspense fallback={<PageLoader />}><Investing /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<PageLoader />}><Reports /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
        <Route path="goals" element={<Suspense fallback={<PageLoader />}><Goals /></Suspense>} />
        <Route path="subscriptions" element={<Suspense fallback={<PageLoader />}><Subscriptions /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
