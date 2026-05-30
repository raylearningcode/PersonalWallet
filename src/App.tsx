import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { Budget } from '@/pages/Budget'
import { Estimation } from '@/pages/Estimation'
import { Investing } from '@/pages/Investing'
import { Reports } from '@/pages/Reports'
import { Settings } from '@/pages/Settings'
import { Goals } from '@/pages/Goals'
import { Subscriptions } from '@/pages/Subscriptions'

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="budget" element={<Budget />} />
        <Route path="estimation" element={<Estimation />} />
        <Route path="investing" element={<Investing />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="goals" element={<Goals />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
