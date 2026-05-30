import type { Transaction, BudgetCategory, RecurringRule, Goal } from '@/types/index'

export type NotificationSeverity = 'critical' | 'warning' | 'info'

export type AppNotification = {
  id: string
  type: 'budget_over' | 'budget_warning' | 'bill_today' | 'bill_soon' | 'goal_stalled'
  title: string
  message: string
  severity: NotificationSeverity
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export function computeNotifications(
  transactions: Transaction[],
  categories: BudgetCategory[],
  recurringRules: RecurringRule[],
  goals: Goal[],
  fmt: (n: number) => string,
): AppNotification[] {
  const notes: AppNotification[] = []
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)

  // Budget alerts
  for (const cat of categories) {
    if (!cat.yearly_allocated || cat.yearly_allocated <= 0) continue
    const spent = transactions
      .filter(t => t.type !== 'income' && t.type !== 'transfer' && t.category === cat.name && t.date >= monthStart)
      .reduce((s, t) => s + t.amount, 0)
    const pct = (spent / cat.yearly_allocated) * 100
    if (pct >= 100) {
      notes.push({
        id: `budget_over_${cat.id}`,
        type: 'budget_over',
        title: `${cat.name} budget exceeded`,
        message: `Spent ${fmt(spent)} — ${Math.round(pct - 100)}% over the ${fmt(cat.yearly_allocated)} limit.`,
        severity: 'critical',
      })
    } else if (pct >= 80) {
      notes.push({
        id: `budget_warn_${cat.id}`,
        type: 'budget_warning',
        title: `${cat.name} at ${Math.round(pct)}%`,
        message: `${fmt(cat.yearly_allocated - spent)} remaining this period.`,
        severity: 'warning',
      })
    }
  }

  // Upcoming bills
  for (const rule of recurringRules) {
    if (!rule.active || rule.type === 'income') continue
    const days = daysUntil(rule.next_due_date)
    if (days === 0) {
      notes.push({
        id: `bill_today_${rule.id}`,
        type: 'bill_today',
        title: `${rule.description} due today`,
        message: `${fmt(rule.amount)} payment is due today.`,
        severity: 'critical',
      })
    } else if (days > 0 && days <= 3) {
      notes.push({
        id: `bill_soon_${rule.id}`,
        type: 'bill_soon',
        title: `${rule.description} in ${days} day${days === 1 ? '' : 's'}`,
        message: `${fmt(rule.amount)} due on ${rule.next_due_date}.`,
        severity: 'warning',
      })
    }
  }

  // Goal stalled (>10% progress and created 60+ days ago with no recent contributions would require TX links)
  // Simple heuristic: goal has < 5% progress and was created 30+ days ago
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  for (const goal of goals) {
    if (goal.current_amount >= goal.target_amount) continue
    const pct = goal.target_amount > 0 ? goal.current_amount / goal.target_amount : 0
    if (pct < 0.05 && goal.created_at && goal.created_at < thirtyDaysAgo) {
      notes.push({
        id: `goal_stalled_${goal.id}`,
        type: 'goal_stalled',
        title: `${goal.name} needs a contribution`,
        message: `Less than 5% funded — ${fmt(goal.target_amount - goal.current_amount)} still to go.`,
        severity: 'info',
      })
    }
  }

  const order: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return notes.sort((a, b) => order[a.severity] - order[b.severity])
}
